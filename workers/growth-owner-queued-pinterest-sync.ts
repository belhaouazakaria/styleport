import { readFileSync } from "node:fs";
import os from "node:os";
import {
  GrowthActivityActorKind, GrowthJobStatus, GrowthPinterestApiEnvironment,
  GrowthPinterestConnectionStatus, Prisma,
} from "@prisma/client";
import { recordGrowthActivity } from "@/lib/growth/activity";
import { selectOwnerQueuedPinterestSync } from "@/lib/growth/pinterest/owner-queued-sync";
import { reserveOneAccountSyncRequest } from "@/lib/growth/pinterest/one-sync-guard";
import { revokeGrowthWorkerActivation } from "@/lib/growth/settings";
import { runGrowthWorker } from "@/lib/growth/worker";
import { prisma } from "@/lib/prisma";

const APP = "/home/saytwist/htdocs/saytwist.com";
const NODE = "/home/saytwist/.nvm/versions/node/v24.20.0/bin/node";
const ACTIVE = [
  GrowthJobStatus.PENDING, GrowthJobStatus.CLAIMED,
  GrowthJobStatus.RUNNING, GrowthJobStatus.FAILED_RETRYABLE,
] as const;
const LEASE_MS = 150_000;

export function assertOwnerPendingSyncRuntime(
  env: Record<string, string | undefined>, deployed: string,
  identity: { username: string; uid: number; cwd: string; node: string },
) {
  const sha = env.EXPECTED_RELEASE ?? "";
  if (!/^[a-f0-9]{40}$/.test(sha) || sha !== deployed ||
      env.GROWTH_OWNER_QUEUED_SYNC_ENTRYPOINT !== "true" ||
      env.GROWTH_OWNER_QUEUED_SYNC_APPROVAL !== "SAYTWIST_COMPLETE_TWO_QUEUED_SYNCS:" + sha ||
      env.NODE_ENV !== "production" ||
      env.GROWTH_WORKER_RUN_ENABLED !== "false" ||
      env.GROWTH_ROLLOUT_MODE !== "OFF" ||
      env.GROWTH_AI_IMAGE_ENABLED !== "false" ||
      env.GROWTH_ATTRIBUTION_COLLECTION_ENABLED !== "false" ||
      env.TELEGRAM_REPORTS_ENABLED !== "false" ||
      env.GROWTH_DAILY_REPORT_SCHEDULE_ENABLED !== "false" ||
      env.PINTEREST_API_ENVIRONMENT !== "production") {
    throw Error("QUEUED_SYNC_RUNTIME_INVALID");
  }
  if (identity.username !== "saytwist" || identity.uid === 0 ||
      identity.cwd !== APP || identity.node !== NODE) {
    throw Error("QUEUED_SYNC_HOST_INVALID");
  }
  let url: URL;
  try { url = new URL(env.DATABASE_URL ?? ""); }
  catch { throw Error("QUEUED_SYNC_DB_INVALID"); }
  if (!["postgresql:", "postgres:"].includes(url.protocol) ||
      url.hostname !== "127.0.0.1" || url.port !== "5433" ||
      decodeURIComponent(url.pathname.slice(1)) !== "saytwist" ||
      !url.username || url.searchParams.has("host")) {
    throw Error("QUEUED_SYNC_DB_INVALID");
  }
  return sha;
}

/** Executes exactly one of the original two owner-queued read-only API jobs.
 * A scoped activation exists for at most 150 seconds and is always revoked.
 * Any unexpected job type, age, account, quota or lease aborts without edits.
 */
async function oneExistingJob(stage: "BOARD" | "ACCOUNT") {
  const now = new Date();
  const expiry = new Date(now.getTime() + LEASE_MS);
  const admitted = await prisma.$transaction(async tx => {
    const lock = await tx.$queryRawUnsafe<Array<{ id: string }>>(
      'SELECT "id" FROM "GrowthSettings" WHERE "id" = ' +
      "'global' FOR UPDATE",
    );
    if (lock.length !== 1) throw Error("QUEUED_SYNC_SETTINGS_MISSING");
    const [settings, policy, jobs] = await Promise.all([
      tx.growthSettings.findUnique({ where: { id: "global" },
        select: { enabled: true, attributionEnabled: true,
          workerActivationExpiresAt: true } }),
      tx.growthViralProgramSettings.findUnique({ where: { id: "global" },
        select: { mode: true, sourceSharePercent: true, maxPinsPerDay: true } }),
      tx.growthJob.findMany({
        where: { status: { in: [...ACTIVE] } },
        orderBy: { createdAt: "asc" }, take: 5,
      }),
    ]);
    if (!settings || settings.enabled || settings.attributionEnabled ||
        settings.workerActivationExpiresAt !== null ||
        !policy || policy.mode !== "ACTIVE" ||
        policy.sourceSharePercent !== 50 || policy.maxPinsPerDay !== 5) {
      throw Error("QUEUED_SYNC_GLOBAL_GATE_BLOCKED");
    }
    const selected = selectOwnerQueuedPinterestSync(jobs, stage);
    if (stage === "ACCOUNT") {
      const boardJob = await tx.growthJob.findFirst({
        where: {
          idempotencyKey: "pinterest:board-sync:" +
            selected.accountId + ":" +
            Math.floor(jobs[0].runAfter.getTime() / 60_000),
          status: GrowthJobStatus.SUCCEEDED,
        }, select: { id: true },
      });
      if (!boardJob) throw Error("QUEUED_SYNC_BOARD_NOT_COMPLETED");
    }
    const account = await tx.growthPinterestAccount.findUnique({
      where: { id: selected.accountId },
      select: { id: true, apiEnvironment: true, connectionStatus: true,
        encryptedCredentials: true, grantedScopes: true,
        accessTokenExpiresAt: true, refreshTokenExpiresAt: true,
        boards: { where: { isActive: true }, select: { id: true }, take: 1 } },
    });
    if (!account || account.apiEnvironment !== GrowthPinterestApiEnvironment.PRODUCTION ||
        account.connectionStatus !== GrowthPinterestConnectionStatus.CONNECTED ||
        !account.encryptedCredentials ||
        !account.grantedScopes.includes("boards:read") ||
        !account.grantedScopes.includes("user_accounts:read") ||
        !account.accessTokenExpiresAt ||
        account.accessTokenExpiresAt.getTime() < now.getTime() + 15 * 60_000 ||
        (account.refreshTokenExpiresAt && account.refreshTokenExpiresAt <= now) ||
        account.boards.length !== 1) {
      throw Error("QUEUED_SYNC_ACCOUNT_NOT_READY");
    }
    const hourAgo = new Date(now.getTime() - 3_600_000);
    const dayAgo = new Date(now.getTime() - 86_400_000);
    const entityType = "GrowthPinterestProviderBudget";
    const entityId = "production-global";
    const [cooldowns, hourly, daily] = await Promise.all([
      tx.growthActivity.count({ where: { entityType, entityId,
        action: "PINTEREST_GLOBAL_API_COOLDOWN",
        createdAt: { gte: hourAgo } } }),
      tx.growthActivity.count({ where: { entityType, entityId,
        action: "PINTEREST_GLOBAL_API_REQUEST_RESERVED",
        createdAt: { gte: hourAgo } } }),
      tx.growthActivity.count({ where: { entityType, entityId,
        action: "PINTEREST_GLOBAL_API_REQUEST_RESERVED",
        createdAt: { gte: dayAgo } } }),
    ]);
    if (cooldowns !== 0 || hourly > 2 || daily > 14) {
      throw Error("QUEUED_SYNC_PROVIDER_BUDGET_BLOCKED");
    }
    if (stage === "ACCOUNT") {
      await reserveOneAccountSyncRequest(tx, selected.accountId,
        "queued-owner-sync:" + selected.jobId, now);
    }
    const changed = await tx.growthSettings.updateMany({
      where: { id: "global", enabled: false, attributionEnabled: false,
        workerActivationExpiresAt: null },
      data: { enabled: true, workerActivationExpiresAt: expiry,
        configVersion: { increment: 1 } },
    });
    if (changed.count !== 1) throw Error("QUEUED_SYNC_LEASE_RACE");
    await recordGrowthActivity({
      actorKind: GrowthActivityActorKind.SYSTEM,
      entityType: "GrowthSettings", entityId: "global",
      action: "OWNER_QUEUED_PINTEREST_SYNC_STARTED",
      correlationKey: "owner-queued-sync:" + selected.jobId,
      summary: { stage, jobId: selected.jobId, accountId: selected.accountId,
        maxProviderGets: 1, providerWrites: 0, aiCalls: 0,
        deadline: expiry.toISOString() },
    }, tx);
    return { ...selected, expiry };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    timeout: 12_000 });

  const board = stage === "BOARD";
  const entrypoint = board ? "GROWTH_PINTEREST_BOARD_SYNC_ENTRYPOINT" :
    "GROWTH_PINTEREST_ONE_SYNC_ENTRYPOINT";
  const scope = board ? "GROWTH_PINTEREST_BOARD_SYNC_JOB_ID" :
    "GROWTH_PINTEREST_ONE_SYNC_JOB_ID";
  process.env[entrypoint] = "true";
  process.env[scope] = admitted.jobId;
  try {
    const result = await runGrowthWorker({
      onlyJobId: admitted.jobId, batchSize: 1,
      workerId: board ? "owner-pending-board-sync" : "owner-pending-account-sync",
      rolloutConfig: { GROWTH_WORKER_RUN_ENABLED: "true",
        GROWTH_ROLLOUT_MODE: "OBSERVE" },
    });
    if (result.status !== "COMPLETED" || result.claimed !== 1 ||
        result.succeeded !== 1 || result.failed !== 0) {
      throw Error("QUEUED_SYNC_SCOPED_JOB_NOT_SUCCEEDED");
    }
  } finally {
    delete process.env[entrypoint];
    delete process.env[scope];
    await revokeGrowthWorkerActivation(admitted.expiry);
  }
  const [job, settings] = await Promise.all([
    prisma.growthJob.findUnique({ where: { id: admitted.jobId },
      select: { status: true, attemptCount: true } }),
    prisma.growthSettings.findUnique({ where: { id: "global" },
      select: { enabled: true, attributionEnabled: true,
        workerActivationExpiresAt: true } }),
  ]);
  if (job?.status !== GrowthJobStatus.SUCCEEDED ||
      job.attemptCount !== 1 ||
      !settings || settings.enabled || settings.attributionEnabled ||
      settings.workerActivationExpiresAt !== null) {
    throw Error("QUEUED_SYNC_POSTCONDITION_FAILED");
  }
  return { stage, status: "SUCCEEDED" as const };
}

export async function completeOwnerQueuedPinterestSyncs() {
  const jobs = await prisma.growthJob.findMany({
    where: { status: { in: [...ACTIVE] } },
    orderBy: { createdAt: "asc" }, take: 5,
  });
  let board: { stage: "BOARD"; status: "SUCCEEDED" } | null = null;
  if (jobs.length === 2) {
    selectOwnerQueuedPinterestSync(jobs, "BOARD");
    board = await oneExistingJob("BOARD");
  } else {
    // Safe resume after an earlier attempt completed the board GET.
    // The ACCOUNT stage independently verifies the matching board job
    // was SUCCEEDED, not cancelled, rewritten or fabricated.
    selectOwnerQueuedPinterestSync(jobs, "ACCOUNT");
  }
  const account = await oneExistingJob("ACCOUNT");
  const blocking = await prisma.growthJob.count({
    where: { status: { in: [...ACTIVE] } },
  });
  if (blocking !== 0) throw Error("QUEUED_SYNC_REMAINING_BLOCKERS");
  return { board, account, pending: blocking };
}

async function main() {
  let stage = "RUNTIME";
  try {
    assertOwnerPendingSyncRuntime(process.env,
      readFileSync(".deployed-release", "utf8").trim(), {
        username: os.userInfo().username,
        uid: process.getuid?.() ?? -1,
        cwd: process.cwd(), node: process.execPath,
      });
    const jobs = await prisma.growthJob.findMany({
      where: { status: { in: [...ACTIVE] } },
      orderBy: { createdAt: "asc" }, take: 5,
    });
    stage = "BOARD";
    if (jobs.length === 2) {
      selectOwnerQueuedPinterestSync(jobs, "BOARD");
      const board = await oneExistingJob("BOARD");
      if (board.status !== "SUCCEEDED") throw Error("QUEUED_SYNC_BOARD_FAILED");
      console.log("GROWTH_OWNER_PENDING_BOARD=SUCCEEDED");
    } else {
      selectOwnerQueuedPinterestSync(jobs, "ACCOUNT");
      console.log("GROWTH_OWNER_PENDING_BOARD=ALREADY_SUCCEEDED");
    }
    stage = "ACCOUNT";
    const account = await oneExistingJob("ACCOUNT");
    if (account.status !== "SUCCEEDED") throw Error("QUEUED_SYNC_ACCOUNT_FAILED");
    console.log("GROWTH_OWNER_PENDING_ACCOUNT=SUCCEEDED");
    stage = "POSTCONDITION";
    const remaining = await prisma.growthJob.count({
      where: { status: { in: [...ACTIVE] } },
    });
    if (remaining !== 0) throw Error("QUEUED_SYNC_REMAINING_BLOCKERS");
    console.log("GROWTH_OWNER_PENDING_QUEUE=EMPTY");
    console.log("GROWTH_OWNER_PENDING_PROVIDER_WRITES=0");
    console.log("GROWTH_OWNER_PENDING_AI_CALLS=0");
    console.log("GROWTH_OWNER_PENDING_GLOBAL=OFF");
  } catch {
    console.error("GROWTH_OWNER_PENDING_SYNC=BLOCKED");
    console.error("GROWTH_OWNER_PENDING_STAGE=" + stage);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect().catch(() => { process.exitCode = 1; });
  }
}

if (process.env.GROWTH_OWNER_QUEUED_SYNC_ENTRYPOINT === "true") void main();
