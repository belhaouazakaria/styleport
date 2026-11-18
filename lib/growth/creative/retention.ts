import {
  GrowthActivityActorKind,
  GrowthAssetState,
  GrowthPinCandidateStatus,
} from "@prisma/client";

import { recordGrowthActivity } from "@/lib/growth/activity";
import { prisma } from "@/lib/prisma";
import { removeCreativeAssetFileIfUnlinked } from "@/lib/growth/creative/storage";

export const CREATIVE_DESIGN_RETENTION_LIMIT = 20;
const RETENTION_LOCK = "growth-creative-retention-v1";
const RETIRABLE_STATUSES = [
  GrowthPinCandidateStatus.READY,
  GrowthPinCandidateStatus.DEFERRED,
  GrowthPinCandidateStatus.REJECTED,
  GrowthPinCandidateStatus.FAILED_TERMINAL,
] as const;

type RetentionCandidate = {
  id: string;
  status: GrowthPinCandidateStatus;
  approvals: Array<{ id: string }>;
  telegramReview: { id: string } | null;
  publications: Array<{ id: string }>;
  preparedFromRecommendation: { id: string } | null;
};

export function selectCreativeCandidatesToRetire<T extends RetentionCandidate>(
  newestFirst: T[],
  keep = CREATIVE_DESIGN_RETENTION_LIMIT,
) {
  const retainedIds = new Set(newestFirst.slice(0, keep).map(({ id }) => id));
  return newestFirst.filter((candidate) =>
    !retainedIds.has(candidate.id) &&
    (RETIRABLE_STATUSES as readonly GrowthPinCandidateStatus[]).includes(candidate.status) &&
    candidate.approvals.length === 0 &&
    candidate.telegramReview === null &&
    candidate.publications.length === 0 &&
    candidate.preparedFromRecommendation === null,
  );
}

export async function pruneOldCreativeDesigns() {
  const retired = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${RETENTION_LOCK}))`;
    const candidates = await tx.growthPinCandidate.findMany({
      where: { status: { not: GrowthPinCandidateStatus.CANCELLED }, asset: { state: GrowthAssetState.READY } },
      select: {
        id: true,
        assetId: true,
        status: true,
        approvals: { select: { id: true }, take: 1 },
        telegramReview: { select: { id: true } },
        publications: { select: { id: true }, take: 1 },
        preparedFromRecommendation: { select: { id: true } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    const possible = selectCreativeCandidatesToRetire(candidates);
    if (!possible.length) return { candidateCount: 0, assetIds: [] as string[] };

    const selected: typeof possible = [];
    for (const candidate of possible) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`pin-approval:${candidate.id}`}))`;
      const current = await tx.growthPinCandidate.findUnique({
        where: { id: candidate.id },
        select: {
          id: true,
          status: true,
          approvals: { select: { id: true }, take: 1 },
          telegramReview: { select: { id: true } },
          publications: { select: { id: true }, take: 1 },
          preparedFromRecommendation: { select: { id: true } },
        },
      });
      if (
        current && current.status === candidate.status &&
        RETIRABLE_STATUSES.includes(current.status as (typeof RETIRABLE_STATUSES)[number]) &&
        current.approvals.length === 0 && current.telegramReview === null &&
        current.publications.length === 0 && current.preparedFromRecommendation === null
      ) selected.push(candidate);
    }
    if (!selected.length) return { candidateCount: 0, assetsRetired: 0 };

    const candidateIds = selected.map(({ id }) => id);
    const changed = await tx.growthPinCandidate.updateMany({
      where: { id: { in: candidateIds }, status: { in: [...RETIRABLE_STATUSES] } },
      data: { status: GrowthPinCandidateStatus.CANCELLED },
    });
    if (!changed.count) return { candidateCount: 0, assetsRetired: 0 };

    for (const candidate of selected) {
      await recordGrowthActivity({
        actorKind: GrowthActivityActorKind.WORKER,
        entityType: "GrowthPinCandidate",
        entityId: candidate.id,
        action: "CREATIVE_DESIGN_RETIRED_BY_RETENTION",
        fromState: candidate.status,
        toState: GrowthPinCandidateStatus.CANCELLED,
        summary: { reason: "STUDIO_RETENTION_LIMIT", retainedDesigns: CREATIVE_DESIGN_RETENTION_LIMIT },
      }, tx);
    }

    const assetIds = [...new Set(selected.map(({ assetId }) => assetId))];
    let assetsRetired = 0;
    for (const assetId of assetIds) {
      const result = await tx.growthAsset.updateMany({
        where: {
          id: assetId,
          state: GrowthAssetState.READY,
          candidates: { none: { status: { not: GrowthPinCandidateStatus.CANCELLED } } },
        },
        data: { state: GrowthAssetState.RETIRED, retainedUntil: new Date() },
      });
      assetsRetired += result.count;
    }
    return { candidateCount: changed.count, assetsRetired };
  });

  let filesRemoved = 0;
  const retiredAssets = await prisma.growthAsset.findMany({
    where: {
      state: GrowthAssetState.RETIRED,
      candidates: { none: { status: { not: GrowthPinCandidateStatus.CANCELLED } } },
    },
    select: { id: true },
  });
  for (const { id: assetId } of retiredAssets) {
    const removed = await prisma.$transaction(async (tx) => {
      const initial = await tx.growthAsset.findUnique({ where: { id: assetId }, select: { checksum: true } });
      if (!initial) return false;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`creative-asset:${initial.checksum}`}))`;
      const asset = await tx.growthAsset.findUnique({ where: { id: assetId }, select: { id: true, publicPath: true, state: true } });
      if (!asset || asset.state !== GrowthAssetState.RETIRED) return false;
      const referenced = await tx.growthPinCandidate.count({ where: { assetId, status: { not: GrowthPinCandidateStatus.CANCELLED } } });
      if (referenced) return false;
      return removeCreativeAssetFileIfUnlinked(asset.publicPath);
    });
    if (removed) filesRemoved += 1;
  }

  return { candidatesRetired: retired.candidateCount, assetsRetired: retired.assetsRetired, filesRemoved };
}

