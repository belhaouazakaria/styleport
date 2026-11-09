import { readFileSync } from "node:fs";
import os from "node:os";
import {
  GrowthActivityActorKind, GrowthJobStatus, GrowthJobType,
  GrowthPinterestApiEnvironment, GrowthPinterestConnectionStatus, Prisma,
} from "@prisma/client";

import { recordGrowthActivity } from "@/lib/growth/activity";
import { revokeGrowthWorkerActivation } from "@/lib/growth/settings";
import { runGrowthWorker } from "@/lib/growth/worker";
import { prisma } from "@/lib/prisma";

const APP = "/home/saytwist/htdocs/saytwist.com";
const NODE = "/home/saytwist/.nvm/versions/node/v24.20.0/bin/node";
const LEASE_MS = 120_000;
const EXPECTED_MINUTE = "2026-11-09T22:47";
const ROLLOUT = { GROWTH_WORKER_RUN_ENABLED: "true", GROWTH_ROLLOUT_MODE: "OBSERVE" };

const ACTIVE = [
  GrowthJobStatus.PENDING, GrowthJobStatus.CLAIMED,
  GrowthJobStatus.RUNNING, GrowthJobStatus.FAILED_RETRYABLE,
];

export function assertOneBoardSyncRuntime(
  env: Record<string, string | undefined>,
  deployedSha: string,
  identity: { username: string; uid: number; cwd: string; node: string },
) {
  const sha = env.EXPECTED_RELEASE || "";
  if (!/^[a-f0-9]{40}$/.test(sha) || sha !== deployedSha ||
      env.GROWTH_PINTEREST_BOARD_SYNC_APPROVAL !== "RUN SAYTWIST PINTEREST BOARD SYNC ONCE " + sha ||
      env.GROWTH_PINTEREST_BOARD_SYNC_ENTRYPOINT !== "true" ||
      env.NODE_ENV !== "production") throw Error("RELEASE_OR_APPROVAL_INVALID");
  if (identity.username !== "saytwist" || identity.uid === 0 ||
      identity.cwd !== APP || identity.node !== NODE) throw Error("HOST_IDENTITY_INVALID");
  for (const flag of [
    "GROWTH_WORKER_RUN_ENABLED", "GROWTH_DAILY_REPORT_SCHEDULE_ENABLED",
    "TELEGRAM_REPORTS_ENABLED", "GROWTH_ATTRIBUTION_COLLECTION_ENABLED",
    "GROWTH_AI_IMAGE_ENABLED",
  ]) if (env[flag] === "true") throw Error("CONFLICTING_AUTOMATION_ENABLED");
  if (env.GROWTH_ROLLOUT_MODE !== "OFF" ||
      env.PINTEREST_API_ENVIRONMENT !== "production" ||
      env.APP_BASE_URL !== "https://saytwist.com") throw Error("ENVIRONMENT_INVALID");
  let url: URL;
  try { url = new URL(env.DATABASE_URL || ""); }
  catch { throw Error("DATABASE_TARGET_INVALID"); }
  if (!["postgres:", "postgresql:"].includes(url.protocol) ||
      url.hostname !== "127.0.0.1" || url.port !== "5433" ||
      decodeURIComponent(url.pathname.slice(1)) !== "saytwist" ||
      url.searchParams.has("host") || !url.username) {
    throw Error("DATABASE_TARGET_INVALID");
  }
  return sha;
}

type SyncJob = {
  id: string;
  type: GrowthJobType;
  status: GrowthJobStatus;
  idempotencyKey: string;
  payload: Prisma.JsonValue | null;
  runAfter: Date;
  attemptCount: number;
  maxAttempts: number;
  workerId: string | null;
  claimedAt: Date | null;
  leaseUntil: Date | null;
  heartbeatAt: Date | null;
  lastError: string | null;
  completedAt: Date | null;
};

function singleAccountId(job: SyncJob, prefix: "account" | "board") {
  if (job.status !== GrowthJobStatus.PENDING ||
      job.attemptCount !== 0 || job.maxAttempts !== 3 ||
      job.workerId || job.claimedAt || job.leaseUntil ||
      job.heartbeatAt || job.completedAt || job.lastError ||
      !job.payload || typeof job.payload !== "object" || Array.isArray(job.payload)) {
    throw Error("SYNC_JOB_NOT_IDLE");
  }
  const accountId = "accountId" in job.payload ? job.payload.accountId : undefined;
  if (typeof accountId !== "string" || !/^[a-z0-9]{10,191}$/.test(accountId) ||
      job.idempotencyKey !== "pinterest:" + prefix + "-sync:" + accountId +
        ":" + Math.floor(job.runAfter.getTime() / 60_000) ||
      !job.runAfter.toISOString().startsWith(EXPECTED_MINUTE)) {
    throw Error("SYNC_JOB_IDENTITY_MISMATCH");
  }
  return accountId;
}

/**
 * Admits one existing owner-queued board-sync job, not a fresh job. This
 * exception requires precisely the known untouched board/account pair.
 * The other account metadata job stays PENDING. The scoped worker can claim
 * only the board job and its transport permits one exact read-only provider
 * GET, at most one 100-item page. No Pinterest writes or AI.
 */
export async function runOneBoardSync(sha: string) {
  if (!/^[a-f0-9]{40}$/.test(sha)) throw Error("RELEASE_INVALID");
  const started = new Date();
  const deadline = new Date(started.getTime() + LEASE_MS);
  let activated = false;
  let boardJobId = "";
  let accountId = "";
  let accountJobId = "";
  try {
    const admission = await prisma.$transaction(async tx => {
      const lock = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "GrowthSettings" WHERE "id"='global' FOR UPDATE
      `;
      if (lock.length !== 1) throw Error("GROWTH_SETTINGS_NOT_FOUND");
      const [settings, viral, jobs] = await Promise.all([
        tx.growthSettings.findUnique({
          where: { id: "global" },
          select: { enabled: true, attributionEnabled: true,
            workerActivationExpiresAt: true },
        }),
        tx.growthViralProgramSettings.findUnique({
          where: { id: "global" }, select: { mode: true },
        }),
        tx.growthJob.findMany({
          where: { status: { in: ACTIVE } },
          select: { id: true, type: true, status: true,
            idempotencyKey: true, payload: true, runAfter: true,
            attemptCount: true, maxAttempts: true, workerId: true,
            claimedAt: true, leaseUntil: true, heartbeatAt: true,
            lastError: true, completedAt: true },
          take: 4,
        }),
      ]);
      if (!settings || settings.enabled || settings.attributionEnabled ||
          settings.workerActivationExpiresAt !== null ||
          viral?.mode !== "REVIEW" || jobs.length !== 2) {
        throw Error("BOARD_SYNC_ADMISSION_NOT_IDLE");
      }
      const boardJobs = jobs.filter(job => job.type === GrowthJobType.PINTEREST_BOARD_SYNC);
      const accountJobs = jobs.filter(job => job.type === GrowthJobType.PINTEREST_ACCOUNT_SYNC);
      if (boardJobs.length !== 1 || accountJobs.length !== 1) {
        throw Error("BOARD_SYNC_UNEXPECTED_QUEUE");
      }
      const board = boardJobs[0] as SyncJob;
      const accountJob = accountJobs[0] as SyncJob;
      const boardAccountId = singleAccountId(board, "board");
      if (singleAccountId(accountJob, "account") !== boardAccountId) {
        throw Error("BOARD_SYNC_WRONG_ACCOUNT");
      }
      const account = await tx.growthPinterestAccount.findUnique({
        where: { id: boardAccountId },
        select: { id: true, apiEnvironment: true, connectionStatus: true,
          encryptedCredentials: true, grantedScopes: true,
          accessTokenExpiresAt: true, refreshTokenExpiresAt: true,
          lastBoardSyncAt: true },
      });
      if (!account || account.apiEnvironment !== GrowthPinterestApiEnvironment.PRODUCTION ||
          account.connectionStatus !== GrowthPinterestConnectionStatus.CONNECTED ||
          !account.encryptedCredentials || !account.grantedScopes.includes("boards:read") ||
          !account.accessTokenExpiresAt ||
          account.accessTokenExpiresAt.getTime() < started.getTime() + 15 * 60_000 ||
          !account.refreshTokenExpiresAt ||
          account.refreshTokenExpiresAt.getTime() <= started.getTime()) {
        throw Error("PINTEREST_BOARD_ACCOUNT_NOT_READY");
      }
      const existingBoards = await tx.growthPinterestBoard.count({
        where: { accountId: account.id, isActive: true },
      });
      if (existingBoards < 1 || existingBoards > 1000) {
        throw Error("PINTEREST_EXISTING_BOARD_INVENTORY_INVALID");
      }
      // Independent shared Pinterest budget is enforced before actual GET.
      // Requiring extra headroom reduces contention with active daily timers.
      const hourAgo = new Date(started.getTime() - 3_600_000);
      const dayAgo = new Date(started.getTime() - 86_400_000);
      const [cooldowns, hourly, daily] = await Promise.all([
        tx.growthActivity.count({ where: {
          entityType: "GrowthPinterestProviderBudget",
          action: "PINTEREST_GLOBAL_API_COOLDOWN",
          createdAt: { gte: hourAgo },
        } }),
        tx.growthActivity.count({ where: {
          entityType: "GrowthPinterestProviderBudget",
          action: "PINTEREST_GLOBAL_API_REQUEST_RESERVED",
          createdAt: { gte: hourAgo },
        } }),
        tx.growthActivity.count({ where: {
          entityType: "GrowthPinterestProviderBudget",
          action: "PINTEREST_GLOBAL_API_REQUEST_RESERVED",
          createdAt: { gte: dayAgo },
        } }),
      ]);
      if (cooldowns !== 0 || hourly !== 0 || daily > 12) {
        throw Error("PINTEREST_BOARD_PROVIDER_BUDGET_NOT_READY");
      }
      const updated = await tx.growthSettings.updateMany({
        where: { id: "global", enabled: false, attributionEnabled: false,
          workerActivationExpiresAt: null },
        data: { enabled: true, workerActivationExpiresAt: deadline,
          configVersion: { increment: 1 } },
      });
      if (updated.count !== 1) throw Error("BOARD_SYNC_ACTIVATION_RACE");
      await recordGrowthActivity({
        actorKind: GrowthActivityActorKind.SYSTEM,
        entityType: "GrowthSettings", entityId: "global",
        action: "WORKER_ACTIVATION_ONE_PINTEREST_BOARD_SYNC",
        fromState: "DISABLED", toState: "ENABLED",
        correlationKey: "one-board-sync:" + board.id,
        summary: { jobId: board.id, accountId: account.id,
          maxGetRequests: 1, maxPages: 1, maxBoards: 100,
          noProviderWrites: true, deadline },
      }, tx);
      return { boardJobId: board.id, accountId: account.id,
        accountJobId: accountJob.id };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 12_000 });
    activated = true;
    boardJobId = admission.boardJobId;
    accountJobId = admission.accountJobId;
    accountId = admission.accountId;

    process.env.GROWTH_PINTEREST_BOARD_SYNC_JOB_ID = boardJobId;
    const outcome = await runGrowthWorker({
      onlyJobId: boardJobId, batchSize: 1,
      workerId: "phase14-board-one-shot",
      rolloutConfig: ROLLOUT,
    });
    if (outcome.status !== "COMPLETED" || outcome.claimed !== 1 ||
        outcome.succeeded !== 1 || outcome.failed !== 0) {
      throw Error("BOARD_SYNC_JOB_NOT_SUCCEEDED");
    }
  } finally {
    delete process.env.GROWTH_PINTEREST_BOARD_SYNC_JOB_ID;
    if (activated) await revokeGrowthWorkerActivation(deadline);
  }

  const [settings, boardJob, accountJob, inventory, count] = await Promise.all([
    prisma.growthSettings.findUnique({
      where: { id: "global" },
      select: { enabled: true, attributionEnabled: true,
        workerActivationExpiresAt: true },
    }),
    prisma.growthJob.findUnique({ where: { id: boardJobId },
      select: { status: true, type: true, attemptCount: true } }),
    prisma.growthJob.findUnique({ where: { id: accountJobId },
      select: { status: true, type: true, attemptCount: true, workerId: true } }),
    prisma.growthPinterestAccount.findUnique({ where: { id: accountId },
      select: { lastBoardSyncAt: true, connectionStatus: true } }),
    prisma.growthPinterestBoard.count({
      where: { accountId, isActive: true },
    }),
  ]);
  if (!settings || settings.enabled || settings.attributionEnabled ||
      settings.workerActivationExpiresAt !== null ||
      boardJob?.status !== GrowthJobStatus.SUCCEEDED ||
      boardJob.type !== GrowthJobType.PINTEREST_BOARD_SYNC ||
      boardJob.attemptCount !== 1 ||
      accountJob?.status !== GrowthJobStatus.PENDING ||
      accountJob.type !== GrowthJobType.PINTEREST_ACCOUNT_SYNC ||
      accountJob.attemptCount !== 0 || accountJob.workerId !== null ||
      !inventory || inventory.connectionStatus !== GrowthPinterestConnectionStatus.CONNECTED ||
      !inventory.lastBoardSyncAt || inventory.lastBoardSyncAt < started ||
      count === 0 || count > 100) {
    throw Error("BOARD_SYNC_POSTCONDITION_FAILED");
  }
  return { job: "SUCCEEDED" as const, growth: "OFF" as const,
    lease: "NONE" as const, accountSync: "PENDING" as const,
    activeBoards: count, providerGets: 1 as const, providerWrites: 0 as const,
    aiCalls: 0 as const, pinsPublished: 0 as const };
}

async function main() {
  try {
    const sha = assertOneBoardSyncRuntime(
      process.env, readFileSync(APP + "/.deployed-release", "utf8").trim(),
      { username: os.userInfo().username, uid: process.getuid?.() ?? -1,
        cwd: process.cwd(), node: process.execPath },
    );
    const result = await runOneBoardSync(sha);
    console.log("GROWTH_ONE_BOARD_SYNC=PASSED");
    console.log("GROWTH_ONE_BOARD_SYNC_JOB=" + result.job);
    console.log("GROWTH_ONE_BOARD_SYNC_GROWTH=" + result.growth);
    console.log("GROWTH_ONE_BOARD_SYNC_LEASE=" + result.lease);
    console.log("GROWTH_ONE_BOARD_SYNC_ACCOUNT_JOB=" + result.accountSync);
    console.log("GROWTH_ONE_BOARD_SYNC_ACTIVE_BOARDS=" + result.activeBoards);
    console.log("GROWTH_ONE_BOARD_SYNC_PROVIDER_GETS=" + result.providerGets);
    console.log("GROWTH_ONE_BOARD_SYNC_PROVIDER_WRITES=" + result.providerWrites);
    console.log("GROWTH_ONE_BOARD_SYNC_AI_CALLS=" + result.aiCalls);
    console.log("GROWTH_ONE_BOARD_SYNC_PINS_PUBLISHED=" + result.pinsPublished);
  } catch {
    console.error("GROWTH_ONE_BOARD_SYNC=BLOCKED");
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect().catch(() => { process.exitCode = 1; });
  }
}

if (process.env.GROWTH_PINTEREST_BOARD_SYNC_ENTRYPOINT === "true") void main();
