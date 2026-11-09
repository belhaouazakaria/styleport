import { readFile } from "node:fs/promises";
import {
  GrowthActivityActorKind, GrowthPinterestConnectionStatus,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  PinterestCreateAmbiguousError, createPinterestPin,
} from "@/lib/growth/pinterest/api";
import {
  PinterestGlobalBudgetBlocked,
} from "@/lib/growth/pinterest/global-budget";
import {
  creativeAssetChecksum, resolveCreativeAssetFile, validateCreativePng,
} from "@/lib/growth/creative/storage";
import { canonicalSourceTranslatorUrl } from "@/lib/growth/viral/catalog";
import { countBlockingGrowthJobs } from "@/lib/growth/operations/approved-publication-queue";
import { revokeGrowthWorkerActivation } from "@/lib/growth/settings";

const ONE_DAY = 86400000;
const REQUIRED_SCOPES = ["pins:read", "pins:write", "boards:read"];

/** Called only from a separately owner-approved, SHA-pinned isolated service.
 * Claim is persisted before any provider attempt; ambiguous results are NEVER
 * blindly retried. Existing SayTwist publisher is not modified.
 */
export async function publishOneApprovedSourcePin(
  now = new Date(),
): Promise<"IDLE"|"PUBLISHED"|"FAILED_PRE_REQUEST"|"OUTCOME_UNKNOWN"> {
  const policy = await prisma.growthViralProgramSettings.findUnique({
    where: { id: "global" }, select: { mode: true },
  });
  if (policy?.mode !== "ACTIVE") return "IDLE";
  const core = await prisma.growthSettings.findUnique({
    where: { id: "global" },
    select: { enabled: true, attributionEnabled: true,
      workerActivationExpiresAt: true },
  });
  if (!core || core.enabled || core.attributionEnabled ||
      core.workerActivationExpiresAt !== null ||
      await countBlockingGrowthJobs(prisma) !== 0) {
    throw Error("VIRAL_SOURCE_PUBLISH_SYSTEM_BUSY");
  }
  const rows = await prisma.growthViralPinTest.findMany({
    where: {
      channel: "SOURCE", status: "APPROVED",
      scheduledAt: { gte: new Date(now.getTime() - ONE_DAY), lte: now },
      publishClaimAt: null,
    },
    orderBy: [{ scheduledAt: "asc" }, { id: "asc" }],
    include: { concept: { select: { sourceUrl: true } } },
    take: 2,
  });
  if (!rows.length) return "IDLE";
  const test = rows[0];
  if (!test.approvedById || !test.approvedAt || !test.scheduledAt ||
      !test.publicationAttemptKey || !test.accountId || !test.boardId ||
      !test.rightsVerified || !test.assetPublicPath || !test.assetChecksum ||
      !test.title || !test.description ||
      canonicalSourceTranslatorUrl(test.destinationUrl) !== test.concept.sourceUrl) {
    throw Error("VIRAL_SOURCE_PUBLISH_APPROVAL_INVALID");
  }
  const [account, board] = await Promise.all([
    prisma.growthPinterestAccount.findUnique({
      where: { id: test.accountId },
      select: { id: true, connectionStatus: true, apiEnvironment: true,
        encryptedCredentials: true, grantedScopes: true },
    }),
    prisma.growthPinterestBoard.findUnique({
      where: { id: test.boardId },
      select: { id: true, accountId: true, isActive: true,
        pinterestBoardId: true },
    }),
  ]);
  if (!account || account.connectionStatus !== GrowthPinterestConnectionStatus.CONNECTED ||
      account.apiEnvironment !== "PRODUCTION" || !account.encryptedCredentials ||
      !REQUIRED_SCOPES.every(scope => account.grantedScopes.includes(scope)) ||
      !board || !board.isActive || board.accountId !== account.id) {
    throw Error("VIRAL_SOURCE_PUBLISH_ACCOUNT_UNSAFE");
  }
  const fileName = test.assetPublicPath.split("/").at(-1) || "";
  if (test.assetPublicPath !== "/generated/growth-creatives/" + fileName) {
    throw Error("VIRAL_SOURCE_PUBLISH_ASSET_UNSAFE");
  }
  const assetPath = resolveCreativeAssetFile(fileName);
  if (!assetPath) throw Error("VIRAL_SOURCE_PUBLISH_ASSET_MISSING");
  const bytes = await readFile(assetPath);
  validateCreativePng(bytes);
  if (creativeAssetChecksum(bytes) !== test.assetChecksum) {
    throw Error("VIRAL_SOURCE_PUBLISH_CHECKSUM_CHANGED");
  }

  // Acquire the same scoped Growth activation lease used by the existing
  // publisher. This serializes against ordinary Growth jobs and prevents
  // two competing workers from creating Pins at the same time.
  const deadline = new Date(now.getTime() + 180000);
  const lease = await prisma.growthSettings.updateMany({
    where: { id: "global", enabled: false,
      attributionEnabled: false, workerActivationExpiresAt: null },
    data: { enabled: true, workerActivationExpiresAt: deadline,
      configVersion: { increment: 1 } },
  });
  if (lease.count !== 1) throw Error("VIRAL_SOURCE_PUBLISH_LEASE_RACE");
  try {
  // Once-only claim, persisted before creating the official Pinterest Pin.
  const claimed = await prisma.growthViralPinTest.updateMany({
    where: { id: test.id, status: "APPROVED", publishClaimAt: null,
      publicationAttemptKey: test.publicationAttemptKey },
    data: { status: "PUBLISHING", publishClaimAt: now },
  });
  if (claimed.count !== 1) return "IDLE";
  await prisma.growthActivity.create({
    data: {
      actorKind: GrowthActivityActorKind.SYSTEM,
      entityType: "GrowthViralPinTest", entityId: test.id,
      action: "VIRAL_SOURCE_PIN_ONCE_CLAIMED",
      correlationKey: test.publicationAttemptKey,
      summary: {
        accountId: account.id, assetChecksum: test.assetChecksum,
        destinationUrl: test.destinationUrl,
        attemptsAuthorized: 1, retriesAuthorized: 0,
      },
    },
  });

  try {
    const result = await createPinterestPin({
      accountId: account.id, boardId: board.pinterestBoardId,
      title: test.title, description: test.description,
      link: test.destinationUrl,
      imageUrl: "https://saytwist.com" + test.assetPublicPath,
      imageBase64: bytes.toString("base64"),
    });
    const pinterestPinId = result.data.id;
    if (!/^\d{5,24}$/.test(pinterestPinId)) throw Error("VIRAL_SOURCE_PIN_RESPONSE_INVALID");
    await prisma.$transaction(async tx => {
      const changed = await tx.growthViralPinTest.updateMany({
        where: { id: test.id, status: "PUBLISHING", pinterestPinId: null },
        data: { status: "PUBLISHED", pinterestPinId, publishedAt: now },
      });
      if (changed.count !== 1) throw Error("VIRAL_SOURCE_PIN_STATE_CHANGED");
      await tx.growthActivity.create({
        data: {
          actorKind: GrowthActivityActorKind.SYSTEM,
          entityType: "GrowthViralPinTest", entityId: test.id,
          action: "VIRAL_SOURCE_PIN_PUBLISHED",
          correlationKey: test.publicationAttemptKey,
          summary: {
            pinterestPinId, destinationUrl: test.destinationUrl,
            title: test.title, providerResponseConfirmed: true,
            thirdPartyContentCopied: false, linkEditAllowed: false,
          },
        },
      });
    });
    return "PUBLISHED";
  } catch (error) {
    const providerNotAttempted = error instanceof PinterestGlobalBudgetBlocked &&
      ["ADMISSION_CLOSED","GLOBAL_QUOTA_EXHAUSTED",
        "PROVIDER_COOLDOWN","UNSAFE_ENDPOINT"].includes(error.code);
    const ambiguity = error instanceof PinterestCreateAmbiguousError;
    const status = providerNotAttempted ? "FAILED" : "OUTCOME_UNKNOWN";
    const code = providerNotAttempted ? "PROVIDER_QUOTA_OR_ADMISSION" :
      ambiguity ? "PROVIDER_RESPONSE_AMBIGUOUS" : "UNVERIFIED_WRITE_OUTCOME";
    await prisma.growthViralPinTest.updateMany({
      where: { id: test.id, status: "PUBLISHING" },
      data: { status, lastErrorCode: code },
    });
    await prisma.growthActivity.create({
      data: {
        actorKind: GrowthActivityActorKind.SYSTEM,
        entityType: "GrowthViralPinTest", entityId: test.id,
        action: "VIRAL_SOURCE_PIN_WRITE_NOT_CONFIRMED",
        correlationKey: test.publicationAttemptKey,
        summary: { status, code, automaticRetry: false,
          PinterestPinWritesAfterAmbiguity: 0 },
      },
    });
    return providerNotAttempted ? "FAILED_PRE_REQUEST" : "OUTCOME_UNKNOWN";
  }
  } finally {
    const revoked = await revokeGrowthWorkerActivation(deadline);
    if (revoked !== 1) throw Error("VIRAL_SOURCE_PUBLISH_LEASE_NOT_REVOKED");
  }
}
