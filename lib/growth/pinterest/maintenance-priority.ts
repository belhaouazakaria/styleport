/**
 * Selects an existing eligible Pin for the already-authorized, one-GET
 * maintenance slot. Ranking uses immutable, locally stored analysis evidence
 * only. It does not enqueue recovery jobs, contact Pinterest, or change caps.
 *
 * Favor up to two historically useful clusters only among Pins within 24h
 * of the oldest due Pin. This prevents targeted recovery from starving older
 * inventory and gives never-synced Pins precedence.
 */
import { prisma } from "@/lib/prisma";
import { OPPORTUNITY_INTELLIGENCE_VERSION } from "@/lib/growth/opportunity/constants";

const MAX_ELIGIBLE_PINS = 500;
const MAX_CLUSTERS = 100;
const PREFERENCE_AGE_WINDOW_MS = 24 * 60 * 60_000;
const RECENT_ANALYSIS_MS = 7 * 24 * 60 * 60_000;

export type DueMaintenancePin = {
  id: string;
  lastAnalyticsSyncAt: Date | null;
};

/** Input must be ordered by lastAnalyticsSyncAt ascending, nulls first, then ID. */
export function chooseMaintenancePinId(
  oldestFirst: readonly DueMaintenancePin[],
  preferredIds: ReadonlySet<string>,
): string | null {
  const oldest = oldestFirst[0];
  if (!oldest) return null;
  const baseline = oldest.lastAnalyticsSyncAt?.getTime() ?? null;
  for (const pin of oldestFirst) {
    if (!preferredIds.has(pin.id)) continue;
    const fetched = pin.lastAnalyticsSyncAt?.getTime() ?? null;
    if (baseline === null) {
      if (fetched === null) return pin.id;
    } else if (fetched !== null &&
      fetched <= baseline + PREFERENCE_AGE_WINDOW_MS) {
      return pin.id;
    }
  }
  return oldest.id;
}

type SnapshotRanking = {
  id: string;
  outboundClicks: bigint;
  pinCount: number;
};

/** Pure, deterministic order: observed clicks per Pin, not total cluster size. */
export function selectPrioritySnapshots(
  snapshots: readonly SnapshotRanking[],
): string[] {
  return snapshots
    .filter(s => s.pinCount > 0 && s.outboundClicks > BigInt(0))
    .sort((a, b) => {
      const left = a.outboundClicks * BigInt(b.pinCount);
      const right = b.outboundClicks * BigInt(a.pinCount);
      return left === right ? a.id.localeCompare(b.id) : left > right ? -1 : 1;
    })
    .slice(0, 2)
    .map(s => s.id);
}

export async function selectMaintenancePinId(input: {
  accountId: string;
  initialBackfill: boolean;
  cutoff: Date;
}): Promise<string | null> {
  const due = input.initialBackfill
    ? { lastAnalyticsSyncAt: null }
    : { OR: [
      { lastAnalyticsSyncAt: null },
      { lastAnalyticsSyncAt: { lt: input.cutoff } },
    ] };
  const pins = await prisma.growthPinterestPin.findMany({
    where: {
      accountId: input.accountId, isActive: true, analyticsEligible: true, ...due,
    },
    select: { id: true, lastAnalyticsSyncAt: true },
    orderBy: [
      { lastAnalyticsSyncAt: { sort: "asc", nulls: "first" } },
      { id: "asc" },
    ],
    take: MAX_ELIGIBLE_PINS + 1,
  });
  if (!pins.length) return null;
  // Never let a truncated candidate set change the previous selection policy.
  if (pins.length > MAX_ELIGIBLE_PINS) return null;

  const latest = await prisma.growthOpportunityAnalysisRun.findFirst({
    where: {
      intelligenceModelVersion: OPPORTUNITY_INTELLIGENCE_VERSION,
      completedAt: { gte: new Date(input.cutoff.getTime() - RECENT_ANALYSIS_MS) },
    },
    orderBy: [{ analysisDate: "desc" }, { createdAt: "desc" }],
    select: { id: true },
  });
  if (!latest) return pins[0].id;

  const snapshots = await prisma.growthContentClusterSnapshot.findMany({
    where: { analysisRunId: latest.id, outboundClicks: { gt: BigInt(0) } },
    select: { id: true, outboundClicks: true, pinCount: true },
    take: MAX_CLUSTERS + 1,
  });
  if (snapshots.length > MAX_CLUSTERS) return pins[0].id;
  const chosen = selectPrioritySnapshots(snapshots);
  if (!chosen.length) return pins[0].id;

  const members = await prisma.growthContentClusterMembership.findMany({
    where: { snapshotId: { in: chosen }, pinId: { not: null } },
    select: { pinId: true },
    take: MAX_ELIGIBLE_PINS + 1,
  });
  if (members.length > MAX_ELIGIBLE_PINS) return pins[0].id;
  return chooseMaintenancePinId(
    pins,
    new Set(members.map(m => m.pinId).filter((id): id is string => id !== null)),
  );
}
