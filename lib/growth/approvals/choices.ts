import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { pinReviewSnapshotSchema, evidenceChecksum } from "./contracts";
import { recommendReviewSchedule } from "./scheduling";
import {
  domainForPinPath,
  pinDestinationUrl,
  PIN_DESTINATION_DOMAINS,
} from "@/lib/growth/publishing/destinations";
import { ROTATION_ROLES } from "@/lib/growth/portfolio/daily-rotation";

type Reader = Pick<
  Prisma.TransactionClient,
  "growthPinterestAccount" | "growthPinCandidate"
>;
export type ReviewChoices = {
  accounts: { value: string; label: string }[];
  boards: { value: string; label: string }[];
  sites: { value: string; label: string }[];
};

/** Choices are allowlisted database identities, never arbitrary URLs or provider writes. */
export async function readReviewChoices(
  review: { kind: string; subjectId: string; snapshot: unknown },
  reader: Reader = prisma,
): Promise<ReviewChoices> {
  const s = pinReviewSnapshotSchema.parse(review.snapshot);
  const accounts = await reader.growthPinterestAccount.findMany({
    where: {
      apiEnvironment: "PRODUCTION",
      connectionStatus: "CONNECTED",
      encryptedCredentials: { not: null },
      grantedScopes: {
        hasEvery: ["pins:read", "pins:write", "boards:read", "boards:write"],
      },
      boards: { some: { isActive: true } },
    },
    select: {
      id: true,
      username: true,
      activeRole: true,
      publicationRole: true,
      boards: {
        where: { isActive: true },
        orderBy: { id: "asc" },
        take: 25,
        select: { id: true, name: true },
      },
    },
    orderBy: { id: "asc" },
    take: 4,
  });
  const eligible = accounts.filter((a) =>
    ROTATION_ROLES.includes(
      (a.activeRole ?? a.publicationRole) as (typeof ROTATION_ROLES)[number],
    ),
  );
  if (eligible.length > 3) throw Error("REVIEW_ACCOUNT_CONFIGURATION_INVALID");
  let sites = [
    { value: "SOURCE_ORIGINAL", label: "AnythingTranslate · credited source" },
  ];
  if (review.kind === "NATIVE_PIN") {
    const candidate = await reader.growthPinCandidate.findUniqueOrThrow({
      where: { id: review.subjectId },
      select: { destinationPath: true },
    });
    sites = PIN_DESTINATION_DOMAINS.filter(
      (domain) =>
        domainForPinPath(domain, candidate.destinationPath) === domain,
    ).map((domain) => ({ value: domain, label: domain }));
  }
  return {
    accounts: eligible.map((a) => ({ value: a.id, label: "@" + a.username })),
    boards: (eligible.find((a) => a.id === s.accountId)?.boards ?? []).map(
      (b) => ({ value: b.id, label: b.name }),
    ),
    sites,
  };
}

/** Lock the same request as approval. Selecting first makes old approval stale;
 * approving first makes the selection a no-op. Evidence and expiry never change. */
export async function replaceReviewPlan(
  input: { requestId: string; action: string; value: string },
  owner: string,
  now = new Date(),
) {
  const original = await prisma.growthApprovalRequest.findUniqueOrThrow({
    where: { id: input.requestId },
  });
  const oldSnapshot = pinReviewSnapshotSchema.parse(original.snapshot);
  const accountId =
    input.action === "PLAN_ACCOUNT" ? input.value : oldSnapshot.accountId;
  const scheduledAt =
    original.status === "PENDING" && accountId !== oldSnapshot.accountId
      ? await recommendReviewSchedule(
          accountId,
          original.subjectId,
          original.kind === "SOURCE_PIN" ? "SOURCE" : "NATIVE",
          now,
        )
      : new Date(oldSnapshot.scheduledAt);
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "GrowthApprovalRequest" WHERE "id" = ${input.requestId} FOR UPDATE`;
    const review = await tx.growthApprovalRequest.findUniqueOrThrow({
      where: { id: input.requestId },
    });
    const actor = await tx.user.findUnique({
      where: { id: owner },
      select: { role: true },
    });
    if (actor?.role !== "ADMIN" || review.ownerUserId !== owner)
      throw Error("REVIEW_UNAUTHORIZED");
    if (review.status !== "PENDING" || review.expiresAt <= now) return review;
    if (
      !["NATIVE_PIN", "SOURCE_PIN"].includes(review.kind) ||
      evidenceChecksum(review.snapshot) !== review.snapshotChecksum
    )
      throw Error("REVIEW_EVIDENCE_MISMATCH");
    const s = pinReviewSnapshotSchema.parse(review.snapshot);
    const choices = await readReviewChoices(review, tx);
    const next = { ...s };
    if (input.action === "PLAN_ACCOUNT") {
      const account = choices.accounts.find((a) => a.value === input.value);
      if (!account) throw Error("REVIEW_CHOICE_UNAVAILABLE");
      next.accountId = account.value;
      next.accountName = account.label.replace(/^@/, "");
      const boards = await readReviewChoices({ ...review, snapshot: next }, tx);
      if (!boards.boards.length) throw Error("REVIEW_CHOICE_UNAVAILABLE");
      next.boardId = boards.boards[0].value;
      next.boardName = boards.boards[0].label;
    } else if (input.action === "PLAN_BOARD") {
      const board = choices.boards.find((b) => b.value === input.value);
      if (!board) throw Error("REVIEW_CHOICE_UNAVAILABLE");
      next.boardId = board.value;
      next.boardName = board.label;
    } else if (input.action === "PLAN_SITE") {
      if (!choices.sites.some((site) => site.value === input.value))
        throw Error("REVIEW_CHOICE_UNAVAILABLE");
      if (review.kind === "SOURCE_PIN") return review; // Source attribution cannot be redirected.
      const candidate = await tx.growthPinCandidate.findUniqueOrThrow({
        where: { id: review.subjectId },
      });
      const domain = PIN_DESTINATION_DOMAINS.find((d) => d === input.value)!;
      next.destinationDomain = domain;
      next.destinationUrl = pinDestinationUrl(
        new URL(candidate.destinationPath, "https://saytwist.com").href,
        domain,
      );
    } else throw Error("REVIEW_CHOICE_INVALID");
    if (
      next.accountId === s.accountId &&
      next.boardId === s.boardId &&
      next.destinationUrl === s.destinationUrl
    )
      return review;
    if (review.kind === "NATIVE_PIN") {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"pin-approval:" + review.subjectId}))`;
      const candidate = await tx.growthPinCandidate.findUniqueOrThrow({
        where: { id: review.subjectId },
        include: { approvals: true },
      });
      if (
        candidate.status !== "READY" ||
        candidate.revision !== s.revision ||
        candidate.contentHash !== s.contentHash ||
        candidate.approvals.length
      )
        throw Error("REVIEW_CANDIDATE_CHANGED");
      if (
        candidate.accountId !== next.accountId ||
        candidate.boardId !== next.boardId
      ) {
        await tx.growthPinCandidate.update({
          where: { id: candidate.id },
          data: {
            accountId: next.accountId,
            boardId: next.boardId,
            revision: { increment: 1 },
          },
        });
        next.revision++;
      }
    }
    next.scheduledAt = scheduledAt.toISOString();
    next.reason =
      "Owner selected this account, board and website. Review the complete replacement plan before approving.";
    const snapshot = pinReviewSnapshotSchema.parse(next);
    const checksum = evidenceChecksum(snapshot);
    const expiresAt = new Date(
      Math.min(review.expiresAt.getTime(), scheduledAt.getTime() - 600_000),
    );
    if (expiresAt <= now) throw Error("REVIEW_SLOT_TOO_SOON");
    await tx.growthApprovalRequest.update({
      where: { id: review.id },
      data: {
        status: "STALE",
        decidedAt: now,
        result: { reason: "OWNER_PLAN_REPLACED" },
      },
    });
    const replacement = await tx.growthApprovalRequest.create({
      data: {
        kind: review.kind,
        subjectId: review.subjectId,
        ownerUserId: owner,
        snapshot: snapshot as Prisma.InputJsonValue,
        snapshotChecksum: checksum,
        dedupeKey:
          review.kind +
          ":" +
          review.subjectId +
          ":choice:" +
          review.id +
          ":" +
          checksum,
        expiresAt,
        createdAt: now,
      },
    });
    await tx.growthNotification.create({
      data: {
        dedupeKey: "review:" + replacement.id,
        requestId: replacement.id,
        payload: { kind: "APPROVAL" },
      },
    });
    await tx.growthActivity.create({
      data: {
        actorKind: "USER",
        actorUserId: owner,
        entityType: "GrowthApprovalRequest",
        entityId: review.id,
        action: "OWNER_REVIEW_PLAN_REPLACED",
        summary: {
          replacementId: replacement.id,
          action: input.action,
          pinApproved: false,
          providerCalls: 0,
          expiryExtended: false,
        },
      },
    });
    return replacement;
  });
}
