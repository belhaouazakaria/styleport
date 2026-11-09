import {
  GrowthActivityActorKind, GrowthPublicationStatus, Prisma,
} from "@prisma/client";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { canonicalSourceTranslatorUrl } from "@/lib/growth/viral/catalog";
import { createOriginalSourceAsset } from "@/lib/growth/viral/source-creative";
import { planViralPortfolio } from "@/lib/growth/viral/portfolio";
import { VIRAL_PORTFOLIO_APPROVAL_LOCK } from "@/lib/growth/viral/portfolio-admission";

const DAY = 86400000;
const AUTHORIZED_SOURCE_CAP = 3;

export async function prepareOriginalSourcePinDraft(conceptId: string, userId: string) {
  if (!/^[a-z0-9]{10,40}$/.test(conceptId) || !userId) {
    throw Error("SOURCE_DRAFT_INPUT_INVALID");
  }
  const [settings, concept, existing] = await Promise.all([
    prisma.growthViralProgramSettings.findUnique({ where: { id: "global" } }),
    prisma.growthViralConcept.findUnique({ where: { id: conceptId } }),
    prisma.growthViralPinTest.findFirst({
      where: { conceptId, channel: "SOURCE",
        status: { in: ["PLANNED","APPROVED","PUBLISHING","OUTCOME_UNKNOWN","PUBLISHED"] } },
      select: { id: true },
    }),
  ]);
  if (!settings || settings.mode !== "ACTIVE") throw Error("SOURCE_DRAFT_NOT_ENABLED");
  if (!concept || canonicalSourceTranslatorUrl(concept.sourceUrl) !== concept.sourceUrl ||
      concept.linkedTranslatorId || existing) throw Error("SOURCE_DRAFT_NOT_ELIGIBLE");

  const creative = await createOriginalSourceAsset(concept.title, concept.sourceUrl);
  try {
    const draft = await prisma.$transaction(async tx => {
      await tx.$queryRawUnsafe(
        "SELECT pg_advisory_xact_lock(hashtext('growth-viral-source-draft-v1'))");
      const verified = await tx.growthViralConcept.findUnique({ where: { id: conceptId } });
      const currentSettings = await tx.growthViralProgramSettings.findUnique({
        where: { id: "global" },
      });
      if (!verified || verified.sourceUrl !== concept.sourceUrl ||
          verified.linkedTranslatorId || currentSettings?.mode !== "ACTIVE") {
        throw Error("SOURCE_DRAFT_RACE");
      }
      const record = await tx.growthViralPinTest.create({
        data: {
          conceptId, channel: "SOURCE", status: "PLANNED",
          destinationUrl: concept.sourceUrl, title: creative.title,
          description: creative.description, assetChecksum: creative.checksum,
          assetPublicPath: creative.publicPath, rightsVerified: true,
        },
      });
      await tx.growthActivity.create({
        data: {
          actorKind: GrowthActivityActorKind.USER, actorUserId: userId,
          entityType: "GrowthViralPinTest", entityId: record.id,
          action: "ORIGINAL_SOURCE_PIN_PREPARED",
          correlationKey: "viral-source-draft:" + record.id,
          summary: {
            assetChecksum: creative.checksum, sourceDomain: "anythingtranslate.com",
            sourceImageUsed: false, copiedThirdPartyDescription: false,
            pinPublished: false, ownerApprovalRequired: true,
          },
        },
      });
      return record;
    });
    return {
      id: draft.id, title: draft.title, description: draft.description,
      destinationUrl: draft.destinationUrl, assetPublicPath: draft.assetPublicPath,
      status: draft.status, pinterestWrites: 0,
    };
  } catch {
    // Uploaded immutable asset may be shared; content-addressed files are
    // retained and never blindly deleted after a race.
    throw Error("SOURCE_DRAFT_CONFLICT");
  }
}

export type SourcePinApprovalInput = {
  draftId: string; accountId: string; boardId: string;
  scheduledAt: string; confirmation: true;
};

function utcDayInterval(date: Date) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  return { start, end: new Date(start.getTime() + DAY) };
}

export async function approveOriginalSourcePin(
  input: SourcePinApprovalInput, userId: string,
  now = new Date(),
) {
  if (!userId || !input.confirmation || !input.draftId ||
      !input.accountId || !input.boardId ||
      !Number.isFinite(Date.parse(input.scheduledAt))) {
    throw Error("SOURCE_APPROVAL_INVALID");
  }
  const scheduled = new Date(input.scheduledAt);
  if (scheduled.getTime() < now.getTime() + 600000 ||
      scheduled.getTime() > now.getTime() + 30 * DAY) {
    throw Error("SOURCE_APPROVAL_SCHEDULE_INVALID");
  }
  const { start, end } = utcDayInterval(scheduled);
  return prisma.$transaction(async tx => {
    // Serialize all channels against the SAME daily portfolio quota lock.
    // A separate SOURCE-only lock permits concurrent cross-channel overbooking.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${VIRAL_PORTFOLIO_APPROVAL_LOCK}))`;
    const [policy, settings, draft, account, board, otherApprovedSaytwist,
      otherSource] = await Promise.all([
      tx.growthViralProgramSettings.findUnique({ where: { id: "global" } }),
      tx.growthSettings.findUnique({ where: { id: "global" } }),
      tx.growthViralPinTest.findUnique({
        where: { id: input.draftId },
        include: { concept: true },
      }),
      tx.growthPinterestAccount.findUnique({
        where: { id: input.accountId },
        select: { id: true, connectionStatus: true,
          apiEnvironment: true, encryptedCredentials: true, grantedScopes: true },
      }),
      tx.growthPinterestBoard.findUnique({
        where: { id: input.boardId },
        select: { id: true, isActive: true, accountId: true },
      }),
      tx.growthPinPublication.count({
        where: {
          scheduledAt: { gte: start, lt: end },
          status: { notIn: [GrowthPublicationStatus.CANCELLED,
            GrowthPublicationStatus.FAILED_TERMINAL] },
        },
      }),
      tx.growthViralPinTest.count({
        where: { channel: "SOURCE", scheduledAt: { gte: start, lt: end },
          status: { in: ["APPROVED","PUBLISHING","OUTCOME_UNKNOWN","PUBLISHED"] } },
      }),
    ]);
    if (!policy || policy.mode !== "ACTIVE" || !settings ||
        settings.enabled || settings.attributionEnabled ||
        settings.workerActivationExpiresAt !== null) {
      throw Error("SOURCE_APPROVAL_GLOBAL_OFF_REQUIRED");
    }
    if (!draft || draft.status !== "PLANNED" || draft.channel !== "SOURCE" ||
        !draft.rightsVerified || !draft.assetChecksum || !draft.assetPublicPath ||
        !draft.title || !draft.description ||
        canonicalSourceTranslatorUrl(draft.destinationUrl) !== draft.concept.sourceUrl) {
      throw Error("SOURCE_APPROVAL_DRAFT_INVALID");
    }
    const scopes = ["pins:read", "pins:write", "boards:read"];
    if (!account || account.connectionStatus !== "CONNECTED" ||
        account.apiEnvironment !== "PRODUCTION" || !account.encryptedCredentials ||
        !scopes.every(x => account.grantedScopes.includes(x)) ||
        !board?.isActive || board.accountId !== input.accountId) {
      throw Error("SOURCE_APPROVAL_ACCOUNT_UNAVAILABLE");
    }
    const alreadyApproved = otherApprovedSaytwist + otherSource;
    const plan = planViralPortfolio({
      mode: "ACTIVE", sourceSharePercent: policy.sourceSharePercent,
      maxPinsPerDay: Math.min(policy.maxPinsPerDay, AUTHORIZED_SOURCE_CAP),
    }, {
      day: start.toISOString().slice(0, 10),
      saytwistCommitted: otherApprovedSaytwist,
      sourceCommitted: otherSource,
      hardDailyPinCap: AUTHORIZED_SOURCE_CAP,
      remainingProviderPublicationCapacity: AUTHORIZED_SOURCE_CAP - Math.min(AUTHORIZED_SOURCE_CAP, alreadyApproved),
      originalConceptsQualified: 1, sourceConceptsQualified: 1,
      sourcePublishingRightsVerified: true,
    });
    if (plan.additional.source < 1) throw Error("SOURCE_APPROVAL_CHANNEL_QUOTA");
    const approvalIdentity = createHash("sha256").update(JSON.stringify({
      id: draft.id, destination: draft.destinationUrl,
      asset: draft.assetChecksum, title: draft.title, description: draft.description,
      board: input.boardId, account: input.accountId,
      scheduledAt: scheduled.toISOString(), userId,
    })).digest("hex");
    const changed = await tx.growthViralPinTest.updateMany({
      where: { id: draft.id, status: "PLANNED" },
      data: {
        status: "APPROVED", accountId: input.accountId, boardId: input.boardId,
        scheduledAt: scheduled, approvedById: userId,
        approvedAt: now, publicationAttemptKey: "viral-source:" + approvalIdentity,
      },
    });
    if (changed.count !== 1) throw Error("SOURCE_APPROVAL_RACE");
    await tx.growthActivity.create({
      data: {
        actorKind: GrowthActivityActorKind.USER, actorUserId: userId,
        entityType: "GrowthViralPinTest", entityId: draft.id,
        action: "SOURCE_PIN_INDIVIDUALLY_APPROVED",
        correlationKey: "viral-source-approval:" + approvalIdentity,
        summary: {
          scheduledAt: scheduled.toISOString(), accountId: input.accountId,
          boardId: input.boardId, assetChecksum: draft.assetChecksum,
          destinationUrl: draft.destinationUrl,
          ownerConfirmation: true, quota: plan.target,
        },
      },
    });
    return { id: draft.id, status: "APPROVED" as const,
      scheduledAt: scheduled.toISOString(), pinterestWrites: 0 };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10000 });
}
