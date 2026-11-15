import { sourceUsesGenZ } from "@/lib/growth/creative/genz-account-scope";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  approvePinCandidate,
  recommendPinApprovalPlan,
  rejectPinCandidate,
} from "@/lib/growth/publishing/service";
import { approveOriginalSourcePin } from "@/lib/growth/viral/source-publishing";
import { buildPublicCreativeAssetUrl } from "@/lib/growth/publishing/snapshot";
import {
  domainForPinPath,
  pinDestinationUrl,
  type PinDestinationDomain,
} from "@/lib/growth/publishing/destinations";
import { recommendReviewSchedule } from "./scheduling";
import {
  budgetChangeSchema,
  evidenceChecksum,
  pinReviewSnapshotSchema,
  type PinReviewSnapshot,
} from "./contracts";

export async function createNativePinReview(
  candidateId: string,
  ownerUserId: string,
  now = new Date(),
) {
  const [candidate, plan, settings] = await Promise.all([
    prisma.growthPinCandidate.findUniqueOrThrow({
      where: { id: candidateId },
      include: { asset: true },
    }),
    recommendPinApprovalPlan(candidateId, now),
    prisma.growthSettings.findUniqueOrThrow({ where: { id: "global" } }),
  ]);
  if (
    candidate.status !== "READY" ||
    (process.env.NODE_ENV === "production" && candidate.asset.generationKind !== "AI") ||
    candidate.asset.state !== "READY" ||
    candidate.asset.mimeType !== "image/png" ||
    candidate.asset.width !== 1000 ||
    candidate.asset.height !== 1500
  )
    throw Error("REVIEW_ASSET_NOT_READY");
  const domain = domainForPinPath(
    settings.defaultPinterestDestinationDomain as PinDestinationDomain,
    candidate.destinationPath,
  );
  const account = await prisma.growthPinterestAccount.findUniqueOrThrow({
    where: { id: plan.accountId },
  });
  const scheduledAt = await recommendReviewSchedule(
    plan.accountId,
    candidate.id,
    "NATIVE",
    now,
  );
  const snapshot: PinReviewSnapshot = {
    title: candidate.title,
    description: candidate.description,
    assetUrl: buildPublicCreativeAssetUrl(candidate.asset.publicPath),
    assetChecksum: candidate.asset.checksum,
    contentHash: candidate.contentHash,
    revision: candidate.revision,
    destinationUrl: pinDestinationUrl(
      new URL(candidate.destinationPath, "https://saytwist.com").href,
      domain,
    ),
    destinationDomain: domain,
    accountId: plan.accountId,
    accountName: account.username,
    boardId: plan.boardId,
    boardName: plan.boardName,
    scheduledAt: scheduledAt.toISOString(),
    reason:
      "Promote this exact original creative using the eligible board and recommended publication window.",
    risks:
      "Public Pinterest publication. Existing quota, account, asset and destination checks run again before dispatch. Standard campaign tracking parameters are added at approval.",
    estimatedCostCents: 0,
  };
  return createReview("NATIVE_PIN", candidateId, ownerUserId, snapshot, now);
}

export async function createSourcePinReview(
  input: {
    draftId: string;
    accountId: string;
    boardId: string;
    scheduledAt: string;
  },
  ownerUserId: string,
  now = new Date(),
) {
  const [draft, account, board] = await Promise.all([
    prisma.growthViralPinTest.findUniqueOrThrow({
      where: { id: input.draftId },
    }),
    prisma.growthPinterestAccount.findUniqueOrThrow({
      where: { id: input.accountId },
    }),
    prisma.growthPinterestBoard.findUniqueOrThrow({
      where: { id: input.boardId },
    }),
  ]);
  if (
    draft.status !== "PLANNED" ||
    (process.env.NODE_ENV === "production" && draft.designGenerationKind !== "AI") ||
    draft.channel !== "SOURCE" ||
    !draft.rightsVerified ||
    !draft.title ||
    !draft.description ||
    !draft.assetChecksum ||
    !draft.assetPublicPath ||
    board.accountId !== account.id ||
    !board.isActive
  )
    throw Error("SOURCE_REVIEW_NOT_READY");
  if (account.publicationRole !== "SAYTWIST" && await sourceUsesGenZ(draft.id)) throw Error("Gen-Z Editorial belongs only to the main SayTwist account.");
  return createReview(
    "SOURCE_PIN",
    draft.id,
    ownerUserId,
    {
      title: draft.title,
      description: draft.description,
      assetUrl: buildPublicCreativeAssetUrl(draft.assetPublicPath),
      assetChecksum: draft.assetChecksum,
      contentHash: evidenceChecksum({
        title: draft.title,
        description: draft.description,
        url: draft.destinationUrl,
      }),
      revision: 1,
      destinationUrl: draft.destinationUrl,
      accountId: account.id,
      accountName: account.username,
      boardId: board.id,
      boardName: board.name,
      scheduledAt: new Date(input.scheduledAt).toISOString(),
      reason:
        "Test audience interest in this credited Anything Translate concept using an original SayTwist creative.",
      risks:
        "This Pin sends visitors to Anything Translate. Its destination is preserved. Any later SayTwist promotion requires a separate approved Pin.",
      estimatedCostCents: 0,
    },
    now,
  );
}

async function createReview(
  kind: "NATIVE_PIN" | "SOURCE_PIN",
  subjectId: string,
  ownerUserId: string,
  raw: PinReviewSnapshot,
  now: Date,
) {
  const snapshot = pinReviewSnapshotSchema.parse(raw);
  const scheduledAt = new Date(snapshot.scheduledAt);
  if (scheduledAt.getTime() <= now.getTime() + 10 * 60_000)
    throw Error("REVIEW_SLOT_TOO_SOON");
  const checksum = evidenceChecksum(snapshot);
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"review:" + kind + ":" + subjectId}))`;
    const owner = await tx.user.findUnique({
      where: { id: ownerUserId },
      select: { role: true },
    });
    if (owner?.role !== "ADMIN") throw Error("REVIEW_OWNER_REQUIRED");
    // Terminal rejection is never reoffered under another request ID.
    const prior = await tx.growthApprovalRequest.findFirst({
      where: {
        kind,
        subjectId,
        status: { in: ["PENDING", "APPROVED", "REJECTED"] },
      },
      orderBy: { createdAt: "desc" },
    });
    if (prior) return prior;
    const request = await tx.growthApprovalRequest.create({
      data: {
        kind,
        subjectId,
        ownerUserId,
        snapshot: snapshot as Prisma.InputJsonValue,
        snapshotChecksum: checksum,
        dedupeKey: kind + ":" + subjectId + ":" + checksum,
        expiresAt: new Date(
          Math.min(
            now.getTime() + 24 * 3600_000,
            scheduledAt.getTime() - 10 * 60_000,
          ),
        ),
        createdAt: now,
      },
    });
    await tx.growthNotification.create({
      data: {
        dedupeKey: "review:" + request.id,
        requestId: request.id,
        payload: { kind: "APPROVAL" },
      },
    });
    return request;
  });
}

export async function decideGrowthReview(
  input: {
    requestId: string;
    action: "APPROVE" | "REJECT";
    snapshotChecksum: string;
  },
  actorUserId: string,
  channel: "ADMIN" | "DISCORD",
  now = new Date(),
) {
  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "GrowthApprovalRequest" WHERE "id" = ${input.requestId} FOR UPDATE`;
      const review = await tx.growthApprovalRequest.findUniqueOrThrow({
        where: { id: input.requestId },
      });
      const owner = await tx.user.findUnique({
        where: { id: actorUserId },
        select: { role: true },
      });
      if (owner?.role !== "ADMIN" || review.ownerUserId !== actorUserId)
        throw Error("REVIEW_UNAUTHORIZED");
      if (
        review.snapshotChecksum !== input.snapshotChecksum ||
        evidenceChecksum(review.snapshot) !== input.snapshotChecksum
      )
        throw Error("REVIEW_EVIDENCE_MISMATCH");
      if (review.status !== "PENDING")
        return { status: review.status, reused: true };
      let status =
        review.expiresAt <= now
          ? "EXPIRED"
          : input.action === "APPROVE"
            ? "APPROVED"
            : "REJECTED";
      let result: Prisma.InputJsonValue = {};
      if (status !== "EXPIRED" && review.kind === "PROTECTED_OPERATION") {
        const operation = budgetChangeSchema.parse(review.snapshot);
        if (input.action === "APPROVE") {
          await tx.$queryRaw`SELECT "id" FROM "GrowthSettings" WHERE "id" = 'global' FOR UPDATE`;
          const settings = await tx.growthSettings.findUniqueOrThrow({
            where: { id: "global" },
          });
          if (
            settings.configVersion !== operation.configVersion ||
            settings.aiDailyBudgetCents !== operation.before.dailyCents ||
            settings.aiMonthlyBudgetCents !== operation.before.monthlyCents ||
            settings.aiImagesPerDayCap !== operation.before.imagesPerDay
          )
            status = "STALE";
          else {
            await tx.growthSettings.update({
              where: { id: "global" },
              data: {
                aiDailyBudgetCents: operation.after.dailyCents,
                aiMonthlyBudgetCents: operation.after.monthlyCents,
                aiImagesPerDayCap: operation.after.imagesPerDay,
                configVersion: { increment: 1 },
              },
            });
            result = {
              operation: operation.action,
              limitsApplied: operation.after,
              paidRequests: 0,
            };
          }
        }
      } else if (status !== "EXPIRED") {
        const s = pinReviewSnapshotSchema.parse(review.snapshot);
        if (review.kind === "NATIVE_PIN") {
          // Same candidate lock as all legacy/Admin approval paths. Check the
          // revision under this lock, then commit the decision + job atomically.
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"pin-approval:" + review.subjectId}))`;
          const c = await tx.growthPinCandidate.findUnique({
            where: { id: review.subjectId },
            include: { asset: true },
          });
          if (
            !c ||
            c.status !== "READY" ||
            (process.env.NODE_ENV === "production" && c.asset.generationKind !== "AI") ||
            c.revision !== s.revision ||
            c.contentHash !== s.contentHash ||
            c.asset.checksum !== s.assetChecksum ||
            c.title !== s.title ||
            c.description !== s.description ||
            buildPublicCreativeAssetUrl(c.asset.publicPath) !== s.assetUrl ||
            (c.accountId && c.accountId !== s.accountId) ||
            pinDestinationUrl(
              new URL(c.destinationPath, "https://saytwist.com").href,
              s.destinationDomain!,
            ) !== s.destinationUrl
          )
            status = "STALE";
          else if (input.action === "APPROVE") {
            const approved = await approvePinCandidate(
              {
                candidateId: review.subjectId,
                accountId: s.accountId,
                boardId: s.boardId,
                scheduledAt: s.scheduledAt,
                destinationDomain: s.destinationDomain,
                confirmation: true,
              },
              actorUserId,
              now,
              tx,
            );
            result = {
              approvalId: approved.approval.id,
              publicationId: approved.publication?.id ?? null,
            };
          } else {
            const rejected = await rejectPinCandidate(
              {
                candidateId: review.subjectId,
                reason: "Owner rejected this exact Pin in " + channel,
              },
              actorUserId,
              now,
              tx,
            );
            result = { approvalId: rejected.id };
          }
        } else if (review.kind === "SOURCE_PIN") {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('growth-viral-portfolio-approval-v1'))`;
          const d = await tx.growthViralPinTest.findUnique({
            where: { id: review.subjectId },
          });
          if (
            !d ||
            d.status !== "PLANNED" ||
            (process.env.NODE_ENV === "production" && d.designGenerationKind !== "AI") ||
            d.assetChecksum !== s.assetChecksum ||
            d.destinationUrl !== s.destinationUrl ||
            d.title !== s.title ||
            d.description !== s.description
          )
            status = "STALE";
          else if (input.action === "APPROVE") {
            result = await approveOriginalSourcePin(
              {
                draftId: d.id,
                accountId: s.accountId,
                boardId: s.boardId,
                scheduledAt: s.scheduledAt,
                confirmation: true,
              },
              actorUserId,
              now,
              tx,
            );
          } else {
            await tx.growthViralPinTest.update({
              where: { id: d.id },
              data: { status: "CANCELLED" },
            });
          }
        } else throw Error("REVIEW_EXECUTOR_NOT_REGISTERED");
      }
      await tx.growthApprovalRequest.update({
        where: { id: review.id },
        data: {
          status,
          decidedAt: now,
          decidedById: actorUserId,
          decisionChannel: channel,
          result,
        },
      });
      await tx.growthActivity.create({
        data: {
          actorKind: "USER",
          actorUserId,
          entityType: "GrowthApprovalRequest",
          entityId: review.id,
          action: "OWNER_REVIEW_" + status,
          summary: {
            channel,
            snapshotChecksum: input.snapshotChecksum,
            result,
          },
        },
      });
      return { status, reused: false };
    },
    { timeout: 20_000 },
  );
}

export async function expireGrowthReviews(now = new Date()) {
  const due = await prisma.growthApprovalRequest.findMany({
    where: { status: "PENDING", expiresAt: { lte: now } },
    select: { id: true },
    orderBy: [{ expiresAt: "asc" }, { id: "asc" }],
    take: 100,
  });
  if (!due.length) return { count: 0 };
  return prisma.growthApprovalRequest.updateMany({
    where: {
      id: { in: due.map((r) => r.id) },
      status: "PENDING",
      expiresAt: { lte: now },
    },
    data: { status: "EXPIRED", decidedAt: now },
  });
}

export async function listGrowthReviews(ownerUserId: string) {
  const now = new Date();
  const [pending, history] = await Promise.all([
    prisma.growthApprovalRequest.findMany({
      where: { ownerUserId, status: "PENDING", expiresAt: { gt: now } },
      orderBy: [{ expiresAt: "asc" }, { id: "asc" }],
      take: 60,
      include: {
        notifications: { select: { status: true, lastErrorCode: true } },
      },
    }),
    prisma.growthApprovalRequest.findMany({
      where: {
        ownerUserId,
        OR: [{ status: { not: "PENDING" } }, { expiresAt: { lte: now } }],
      },
      orderBy: { createdAt: "desc" },
      take: 30,
      include: {
        notifications: { select: { status: true, lastErrorCode: true } },
      },
    }),
  ]);
  return [...pending, ...history];
}

/** At most three review preparations per tick; no provider credentials needed.
 * Existing requests dedupe offers, and rejected subjects are never reoffered. */
export async function preparePendingOwnerReviews(
  ownerUserId: string,
  now = new Date(),
) {
  const [native, source] = await Promise.all([
    prisma.growthPinCandidate.findMany({
      where: {
        status: "READY",
        ...(process.env.NODE_ENV === "production" ? { asset: { generationKind: "AI" as const } } : {}),
        createdAt: { gte: new Date(now.getTime() - 72 * 3600000) },
        approvals: { none: { status: "APPROVED" } },
      },
      select: { id: true },
      orderBy: { createdAt: "asc" },
      take: 30,
    }),
    prisma.growthViralPinTest.findMany({
      where: { channel: "SOURCE", status: "PLANNED", rightsVerified: true, ...(process.env.NODE_ENV === "production" ? { designGenerationKind: "AI" } : {}) },
      select: { id: true },
      orderBy: { createdAt: "asc" },
      take: 30,
    }),
  ]);
  const prior = await prisma.growthApprovalRequest.findMany({
    where: {
      subjectId: { in: [...native, ...source].map((c) => c.id) },
      status: { in: ["PENDING", "APPROVED", "REJECTED"] },
    },
    select: { subjectId: true },
    take: 100,
  });
  const offered = new Set(prior.map((p) => p.subjectId));
  const queue = [
    ...source
      .filter((s) => !offered.has(s.id))
      .slice(0, 2)
      .map((s) => ({ id: s.id, source: true })),
    ...native
      .filter((n) => !offered.has(n.id))
      .slice(0, 1)
      .map((n) => ({ id: n.id, source: false })),
  ];
  const { prepareSourceReviewAutomatically } = await import("./source-plan");
  let prepared = 0;
  for (const subject of queue) {
    try {
      if (subject.source)
        await prepareSourceReviewAutomatically(subject.id, ownerUserId, now);
      else await createNativePinReview(subject.id, ownerUserId, now);
      prepared++;
    } catch {
      await prisma.growthActivity.create({
        data: {
          actorKind: "SYSTEM",
          entityType: "GrowthPinReviewPreparation",
          entityId: subject.id,
          action: "OWNER_REVIEW_PREPARATION_BLOCKED",
          summary: { source: subject.source, providerWrites: 0 },
        },
      });
    }
  }
  return { prepared };
}

export async function createBudgetChangeReview(
  raw: unknown,
  ownerUserId: string,
  now = new Date(),
) {
  const { budgetChangeSchema } = await import("./contracts");
  const snapshot = budgetChangeSchema.parse(raw);
  return prisma.$transaction(async (tx) => {
    const owner = await tx.user.findUnique({
      where: { id: ownerUserId },
      select: { role: true },
    });
    if (owner?.role !== "ADMIN") throw Error("REVIEW_OWNER_REQUIRED");
    const checksum = evidenceChecksum(snapshot);
    const dedupeKey =
      "budget-change:" +
      ownerUserId +
      ":" +
      evidenceChecksum({
        action: snapshot.action,
        configVersion: snapshot.configVersion,
        before: snapshot.before,
        after: snapshot.after,
      });
    const existing = await tx.growthApprovalRequest.findUnique({
      where: { dedupeKey },
    });
    if (existing) return existing;
    const review = await tx.growthApprovalRequest.create({
      data: {
        kind: "PROTECTED_OPERATION",
        subjectId: "growth-ai-budget",
        dedupeKey,
        ownerUserId,
        snapshot,
        snapshotChecksum: checksum,
        expiresAt: new Date(now.getTime() + 24 * 3600000),
      },
    });
    await tx.growthNotification.create({
      data: {
        requestId: review.id,
        dedupeKey: "review:" + review.id,
        payload: { kind: "APPROVAL" },
      },
    });
    return review;
  });
}
