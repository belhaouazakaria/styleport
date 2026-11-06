import { readFileSync } from "node:fs";
import os from "node:os";
import {
  GrowthJobStatus,
  GrowthJobType,
  GrowthPinApprovalStatus,
  GrowthPinCandidateStatus,
  GrowthPublicationStatus,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { dispatchGrowthJob } from "@/lib/growth/handlers";
import { claimGrowthJobs, markGrowthJobRunning, completeGrowthJob, failGrowthJob } from "@/lib/growth/jobs";
import { revokeGrowthWorkerActivation } from "@/lib/growth/settings";
import {
  countBlockingGrowthJobs,
  PUBLISHER_FRESH_CANDIDATE_AFTER,
} from "@/lib/growth/operations/approved-publication-queue";
import {
  PINTEREST_GLOBAL_DAILY_CEILING,
  PINTEREST_GLOBAL_HOURLY_CEILING,
} from "@/lib/growth/pinterest/global-budget";

const APP = "/home/saytwist/htdocs/saytwist.com";
const NODE = "/home/saytwist/.nvm/versions/node/v24.20.0/bin/node";
const LEASE_MS = 180_000;
const MAX_PAST_DUE_MS = 24 * 60 * 60_000;
const PUBLISHER_NAME = "saytwist-growth-approved-publisher";
const REQUIRED_SCOPES = ["boards:read", "boards:write", "pins:read", "pins:write"];
type Selected = Awaited<ReturnType<typeof selectOneDue>>;

export function assertApprovedPublisherRuntime(
  env: Record<string, string | undefined>,
  deployedSha: string,
  identity: { username: string; uid: number; cwd: string; node: string },
) {
  const sha = env.EXPECTED_RELEASE || "";
  if (!/^[a-f0-9]{40}$/.test(sha) || deployedSha !== sha ||
      env.GROWTH_APPROVED_PUBLISHER_ENABLED !== "true" ||
      env.GROWTH_APPROVED_PUBLISHER_APPROVAL !== "SAYTWIST_APPROVED_PUBLISHER_SCHEDULED:" + sha ||
      env.NODE_ENV !== "production" ||
      identity.username !== "saytwist" || identity.uid === 0 ||
      identity.cwd !== APP || identity.node !== NODE) throw Error("PUBLISHER_RELEASE_OR_IDENTITY");
  for (const flag of [
    "GROWTH_WORKER_RUN_ENABLED", "GROWTH_DAILY_REPORT_SCHEDULE_ENABLED",
    "TELEGRAM_REPORTS_ENABLED", "GROWTH_ATTRIBUTION_COLLECTION_ENABLED",
  ]) if (env[flag] !== "false") throw Error("PUBLISHER_UNEXPECTED_AUTOMATION");
  if (env.GROWTH_ROLLOUT_MODE !== "OFF" ||
      env.GROWTH_AI_IMAGE_ENABLED !== "false" ||
      env.PINTEREST_API_ENVIRONMENT !== "production" ||
      env.APP_BASE_URL !== "https://saytwist.com") throw Error("PUBLISHER_ENV_INVALID");
  for (const key of [
    "PINTEREST_APP_ID", "PINTEREST_APP_SECRET", "PINTEREST_REDIRECT_URI",
    "GROWTH_CREDENTIAL_ENCRYPTION_KEY",
  ]) if (!env[key]) throw Error("PUBLISHER_CREDENTIAL_UNAVAILABLE");
  const url = new URL(env.DATABASE_URL || "");
  if (!["postgres:", "postgresql:"].includes(url.protocol) ||
      url.hostname !== "127.0.0.1" || url.port !== "5433" ||
      decodeURIComponent(url.pathname.slice(1)) !== "saytwist" ||
      url.searchParams.has("host") || !url.username) {
    throw Error("PUBLISHER_DATABASE_INVALID");
  }
  return sha;
}

async function selectOneDue(now: Date) {
  const rows = await prisma.growthPinPublication.findMany({
    where: {
      status: GrowthPublicationStatus.SCHEDULED,
      scheduledAt: { lte: now, gte: new Date(now.getTime() - MAX_PAST_DUE_MS) },
      candidate: { createdAt: { gte: PUBLISHER_FRESH_CANDIDATE_AFTER } },
      publishJob: { is: {
        status: GrowthJobStatus.PENDING,
        type: GrowthJobType.PINTEREST_PIN_PUBLISH,
        attemptCount: 0,
        runAfter: { lte: now },
      } },
    },
    include: {
      publishJob: true,
      approval: true,
      candidate: { include: { asset: true } },
      board: true,
      account: true,
    },
    orderBy: [{ scheduledAt: "asc" }, { createdAt: "asc" }],
    take: 2,
  });
  if (!rows.length) return null;
  const row = rows[0];
  const job = row.publishJob;
  if (!job || job.type !== GrowthJobType.PINTEREST_PIN_PUBLISH ||
      job.status !== GrowthJobStatus.PENDING || job.attemptCount !== 0 ||
      job.runAfter.getTime() !== row.scheduledAt.getTime() ||
      job.idempotencyKey !== row.idempotencyKey ||
      row.idempotencyKey !== "pinterest-publish:" + row.id ||
      (job.payload as { publicationId?: unknown } | null)?.publicationId !== row.id ||
      row.approval.status !== GrowthPinApprovalStatus.APPROVED ||
      !row.approval.approvedById || !row.approval.reviewedAt ||
      row.approval.candidateId !== row.candidateId ||
      row.approval.candidateRevision !== row.candidate.revision ||
      row.approval.accountId !== row.accountId ||
      row.approval.boardId !== row.boardId ||
      row.approval.scheduledAt?.getTime() !== row.scheduledAt.getTime() ||
      row.candidate.status !== GrowthPinCandidateStatus.READY ||
      row.candidate.asset.mimeType !== "image/png" ||
      row.candidate.asset.width !== 1000 || row.candidate.asset.height !== 1500 ||
      row.account.connectionStatus !== "CONNECTED" ||
      row.account.apiEnvironment !== "PRODUCTION" ||
      !row.account.encryptedCredentials ||
      !row.account.grantedScopes ||
      !REQUIRED_SCOPES.every(scope => row.account.grantedScopes.includes(scope)) ||
      !row.account.accessTokenExpiresAt ||
      row.account.accessTokenExpiresAt.getTime() < now.getTime() + 20 * 60_000 ||
      (row.account.refreshTokenExpiresAt && row.account.refreshTokenExpiresAt <= now) ||
      !row.board.isActive || row.board.accountId !== row.accountId) {
    throw Error("PUBLISHER_DUE_JOB_UNSAFE");
  }
  return row;
}

async function providerCapacity(now: Date) {
  const [hour, day, cooldown] = await Promise.all([
    prisma.growthActivity.count({ where: {
      entityType: "GrowthPinterestProviderBudget", entityId: "production-global",
      action: "PINTEREST_GLOBAL_API_REQUEST_RESERVED",
      createdAt: { gte: new Date(now.getTime() - 3_600_000) },
    } }),
    prisma.growthActivity.count({ where: {
      entityType: "GrowthPinterestProviderBudget", entityId: "production-global",
      action: "PINTEREST_GLOBAL_API_REQUEST_RESERVED",
      createdAt: { gte: new Date(now.getTime() - 86_400_000) },
    } }),
    prisma.growthActivity.count({ where: {
      entityType: "GrowthPinterestProviderBudget", entityId: "production-global",
      action: "PINTEREST_GLOBAL_API_COOLDOWN",
      createdAt: { gte: new Date(now.getTime() - 3_600_000) },
    } }),
  ]);
  return hour < PINTEREST_GLOBAL_HOURLY_CEILING &&
    day < PINTEREST_GLOBAL_DAILY_CEILING && cooldown === 0;
}

export async function runApprovedPublisherOnce() {
  const now = new Date();
  const settings = await prisma.growthSettings.findUnique({
    where: { id: "global" },
    select: { enabled: true, attributionEnabled: true, workerActivationExpiresAt: true },
  });
  if (!settings || settings.enabled || settings.attributionEnabled ||
      settings.workerActivationExpiresAt !== null) throw Error("PUBLISHER_GROWTH_NOT_IDLE");
  const due: Selected = await selectOneDue(now);
  if (!due) return "IDLE" as const;

  // A pending, explicitly approved future Pin is inert: it is not a free-running
  // worker. Every other active Growth job must be absent before admission.
  if (await countBlockingGrowthJobs(prisma) !== 0) {
    throw Error("PUBLISHER_UNRELATED_ACTIVE_JOB");
  }
  if (!await providerCapacity(now)) return "QUOTA_PAUSED" as const;
  const expires = new Date(Date.now() + LEASE_MS);
  let leased = false;
  try {
    const changed = await prisma.growthSettings.updateMany({
      where: {
        id: "global", enabled: false, attributionEnabled: false,
        workerActivationExpiresAt: null,
      },
      data: { enabled: true, workerActivationExpiresAt: expires,
        configVersion: { increment: 1 } },
    });
    if (changed.count !== 1) throw Error("PUBLISHER_LEASE_RACE");
    leased = true;
    const scope = due.publishJob!.id;
    const workerId = PUBLISHER_NAME + ":" + scope;
    const claimed = await claimGrowthJobs({
      workerId, limit: 1, jobId: scope,
      allowedTypes: [GrowthJobType.PINTEREST_PIN_PUBLISH],
    });
    if (claimed.length !== 1 || claimed[0].id !== scope ||
        claimed[0].type !== GrowthJobType.PINTEREST_PIN_PUBLISH ||
        claimed[0].attemptCount !== 1) throw Error("PUBLISHER_EXACT_CLAIM_FAILED");
    const job = claimed[0];
    await markGrowthJobRunning(job, workerId);
    try {
      if (Date.now() >= expires.getTime() - 30_000) {
        throw Error("PUBLISHER_LEASE_TOO_SHORT");
      }
      const summary = await dispatchGrowthJob(job);
      await completeGrowthJob(job, workerId, summary);
    } catch (error) {
      // Keep the actual typed error, not a fabricated generic failure. That
      // correctly retires deterministic Pinterest 4xx failures as terminal.
      await failGrowthJob(job, workerId, error);
      throw Error("PUBLISHER_PROVIDER_OR_RECONCILIATION_FAILED");
    }
  } finally {
    if (leased) await revokeGrowthWorkerActivation(expires);
  }

  const [final, after] = await Promise.all([
    prisma.growthPinPublication.findUnique({
      where: { id: due.id },
      select: { status: true, pinterestPinId: true },
    }),
    prisma.growthSettings.findUnique({
      where: { id: "global" },
      select: { enabled: true, attributionEnabled: true, workerActivationExpiresAt: true },
    }),
  ]);
  if (!after || after.enabled || after.attributionEnabled ||
      after.workerActivationExpiresAt !== null || !final) {
    throw Error("PUBLISHER_POSTCONDITION_FAILED");
  }
  if (final.status === GrowthPublicationStatus.RECONCILING) {
    // Never send a second Create Pin while reconciliation is pending.
    return "RECONCILIATION_PENDING" as const;
  }
  if (final.status !== GrowthPublicationStatus.RECONCILED || !final.pinterestPinId) {
    throw Error("PUBLISHER_PUBLICATION_UNCONFIRMED");
  }
  return "PUBLISHED" as const;
}

async function main() {
  let stage = "RUNTIME";
  try {
    assertApprovedPublisherRuntime(
      process.env,
      readFileSync(APP + "/.deployed-release", "utf8").trim(),
      {
        username: os.userInfo().username,
        uid: process.getuid?.() ?? -1,
        cwd: process.cwd(),
        node: process.execPath,
      },
    );
    stage = "DISPATCH";
    const outcome = await runApprovedPublisherOnce();
    console.log("GROWTH_APPROVED_PUBLISHER=" + outcome);
    console.log("GROWTH_APPROVED_PUBLISHER_GROWTH=OFF");
    console.log("GROWTH_APPROVED_PUBLISHER_AI_CALLS=0");
  } catch {
    console.error("GROWTH_APPROVED_PUBLISHER=BLOCKED");
    console.error("GROWTH_APPROVED_PUBLISHER_STAGE=" + stage);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect().catch(() => { process.exitCode = 1; });
  }
}
if (process.env.GROWTH_APPROVED_PUBLISHER_ENTRYPOINT === "true") void main();
