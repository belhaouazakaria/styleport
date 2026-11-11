import { readFileSync } from "node:fs";
import os from "node:os";
import { GrowthActivityActorKind, GrowthJobStatus, GrowthJobType, GrowthPinterestApiEnvironment, GrowthPinterestConnectionStatus, Prisma } from "@prisma/client";
import { recordGrowthActivity } from "@/lib/growth/activity";
import { countBlockingGrowthJobs } from "@/lib/growth/operations/approved-publication-queue";
import { revokeGrowthWorkerActivation } from "@/lib/growth/settings";
import { runGrowthWorker } from "@/lib/growth/worker";
import { prisma } from "@/lib/prisma";
import { completedUtcAnalyticsWindow } from "./growth-daily-account-analytics";

const APP = "/home/saytwist/htdocs/saytwist.com";
const NODE = "/home/saytwist/.nvm/versions/node/v24.20.0/bin/node";
const HOURS = [10, 12, 14, 16, 18, 20, 22] as const;
const LEASE_MS = 150_000;
const INVENTORY_AGE_MS = 24 * 60 * 60_000;
const HOUR_MS = 60 * 60_000;
const DAY_MS = 24 * HOUR_MS;
const ROLLOUT = {
  GROWTH_WORKER_RUN_ENABLED: "true", GROWTH_ROLLOUT_MODE: "ANALYTICS",
  GROWTH_PIN_MAINTENANCE_SCOPE: "true", GROWTH_DAILY_ANALYTICS_SCOPE: "false",
};

export function assertPinMaintenanceRuntime(
  env: Record<string, string | undefined>, deployed: string,
  identity: { username: string; uid: number; cwd: string; node: string },
  now = new Date(),
) {
  const sha = env.EXPECTED_RELEASE || "";
  if (!/^[a-f0-9]{40}$/.test(sha) || sha !== deployed ||
      env.NODE_ENV !== "production" ||
      env.GROWTH_PIN_MAINTENANCE_ENTRYPOINT !== "true" ||
      env.GROWTH_PIN_MAINTENANCE_ENABLED !== "true" ||
      env.GROWTH_PIN_MAINTENANCE_APPROVAL !== "SAYTWIST_PIN_MAINTENANCE:" + sha ||
      env.GROWTH_PIN_MAINTENANCE_DAY !== now.toISOString().slice(0, 10) ||
      !HOURS.includes(now.getUTCHours() as typeof HOURS[number]) ||
      now.getUTCMinutes() < 45 || now.getUTCMinutes() >= 55) {
    throw Error("PIN_MAINTENANCE_RUNTIME_INVALID");
  }
  if (identity.username !== "saytwist" || identity.uid === 0 ||
      identity.cwd !== APP || identity.node !== NODE) {
    throw Error("PIN_MAINTENANCE_IDENTITY_INVALID");
  }
  for (const flag of ["GROWTH_WORKER_RUN_ENABLED", "GROWTH_DAILY_REPORT_SCHEDULE_ENABLED",
    "TELEGRAM_REPORTS_ENABLED", "GROWTH_ATTRIBUTION_COLLECTION_ENABLED",
    "GROWTH_AI_IMAGE_ENABLED", "GROWTH_DAILY_ANALYTICS_SCOPE"]) {
    if (env[flag] !== "false") throw Error("PIN_MAINTENANCE_UNSAFE_FLAGS");
  }
  if (env.GROWTH_ROLLOUT_MODE !== "OFF" ||
      env.GROWTH_PIN_MAINTENANCE_SCOPE !== "false" ||
      env.PINTEREST_API_ENVIRONMENT !== "production" ||
      env.APP_BASE_URL !== "https://saytwist.com") throw Error("PIN_MAINTENANCE_ENV_INVALID");
  let db: URL;
  try { db = new URL(env.DATABASE_URL || ""); }
  catch { throw Error("PIN_MAINTENANCE_DATABASE_INVALID"); }
  if (!["postgres:", "postgresql:"].includes(db.protocol) ||
      db.hostname !== "127.0.0.1" || db.port !== "5433" ||
      decodeURIComponent(db.pathname.slice(1)) !== "saytwist" ||
      db.searchParams.has("host") || !db.username) {
    throw Error("PIN_MAINTENANCE_DATABASE_INVALID");
  }
  return { sha, day: now.toISOString().slice(0, 10), hour: now.getUTCHours() };
}

export function chooseMaintenanceKind(state: {
  inventoryStartedAt: Date | null; inventoryBookmark: string | null;
  lastInventorySyncAt: Date | null;
}, eligible: number, now: Date) {
  if (state.inventoryStartedAt || state.inventoryBookmark ||
      !state.lastInventorySyncAt ||
      now.getTime() - state.lastInventorySyncAt.getTime() >= INVENTORY_AGE_MS) {
    return GrowthJobType.PINTEREST_PIN_INVENTORY_SYNC;
  }
  return eligible > 0 ? GrowthJobType.PINTEREST_PIN_ANALYTICS_SYNC : null;
}

/** Fail-closed, one scoped job per permitted UTC slot. No generic queue sweep.
 * Publisher and account analytics retain headroom under the 4/hour, 16/day
 * shared durable Pinterest transport budget.
 */
export async function runBoundedPinMaintenance(now = new Date()) {
  if (!Number.isFinite(now.getTime()) ||
      !HOURS.includes(now.getUTCHours() as typeof HOURS[number]) ||
      now.getUTCMinutes() < 45 || now.getUTCMinutes() >= 55) {
    throw Error("MAINTENANCE_WINDOW_INVALID");
  }
  const deadline = new Date(Date.now() + LEASE_MS);
  const key = "growth-pin-maintenance-v1:" + now.toISOString().slice(0, 13).replace("T", ":");
  const range = completedUtcAnalyticsWindow(now.toISOString().slice(0, 10));
  let lease = false;
  let jobId: string | null = null;
  let kind: GrowthJobType | null = null;
  try {
    const admitted = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "GrowthSettings"
        WHERE "id" = 'global' FOR UPDATE`;
      const settings = await tx.growthSettings.findUnique({
        where: { id: "global" },
        select: { enabled: true, attributionEnabled: true, workerActivationExpiresAt: true },
      });
      if (!settings || settings.enabled || settings.attributionEnabled ||
          settings.workerActivationExpiresAt !== null ||
          await countBlockingGrowthJobs(tx) !== 0) {
        return { status: "SKIPPED_BUSY" as const };
      }
      const accounts = await tx.growthPinterestAccount.findMany({
        where: { apiEnvironment: GrowthPinterestApiEnvironment.PRODUCTION,
          connectionStatus: GrowthPinterestConnectionStatus.CONNECTED },
        select: { id: true, encryptedCredentials: true, grantedScopes: true,
          accessTokenExpiresAt: true, refreshTokenExpiresAt: true }, take: 2,
      });
      if (accounts.length !== 1) throw Error("PIN_MAINTENANCE_ACCOUNT_COUNT");
      const account = accounts[0];
      if (!account.encryptedCredentials ||
          !account.grantedScopes.includes("pins:read") ||
          !account.grantedScopes.includes("user_accounts:read") ||
          !account.accessTokenExpiresAt ||
          account.accessTokenExpiresAt.getTime() <= Date.now() + 20 * 60_000 ||
          (account.refreshTokenExpiresAt && account.refreshTokenExpiresAt <= now)) {
        throw Error("PIN_MAINTENANCE_ACCOUNT_NOT_READY");
      }
      const state = await tx.growthPinterestAnalyticsState.findUnique({
        where: { accountId: account.id },
        select: { inventoryStartedAt: true, inventoryBookmark: true, lastInventorySyncAt: true },
      });
      if (!state) throw Error("PIN_MAINTENANCE_STATE_MISSING");
      const eligible = await tx.growthPinterestPin.count({
        where: { accountId: account.id, isActive: true, analyticsEligible: true },
      });
      const selected = chooseMaintenanceKind(state, eligible, now);
      if (!selected) return { status: "SKIPPED_NO_PINS" as const };
      const previous = await tx.growthJob.findUnique({
        where: { idempotencyKey: key }, select: { id: true },
      });
      if (previous) return { status: "ALREADY_ATTEMPTED" as const };
      const where = { entityType: "GrowthPinterestProviderBudget",
        entityId: "production-global", action: "PINTEREST_GLOBAL_API_REQUEST_RESERVED" };
      const [hourly, daily] = await Promise.all([
        tx.growthActivity.count({ where: { ...where,
          createdAt: { gte: new Date(now.getTime() - HOUR_MS) } } }),
        tx.growthActivity.count({ where: { ...where,
          createdAt: { gte: new Date(now.getTime() - DAY_MS) } } }),
      ]);
      if (hourly >= 2 || daily >= 10) return { status: "SKIPPED_BUDGET" as const };
      const changed = await tx.growthSettings.updateMany({
        where: { id: "global", enabled: false, attributionEnabled: false,
          workerActivationExpiresAt: null },
        data: { enabled: true, workerActivationExpiresAt: deadline,
          configVersion: { increment: 1 } },
      });
      if (changed.count !== 1) throw Error("PIN_MAINTENANCE_LEASE_RACE");
      const job = await tx.growthJob.create({
        data: { type: selected, idempotencyKey: key,
          payload: { accountId: account.id, ...range,
            runStartedAt: now.toISOString(),
            ...(selected === GrowthJobType.PINTEREST_PIN_ANALYTICS_SYNC
              ? { batch: 0, relevancePrepared: true } : {}) },
          maxAttempts: 1 },
        select: { id: true },
      });
      await recordGrowthActivity({
        actorKind: GrowthActivityActorKind.SYSTEM,
        entityType: "GrowthJob", entityId: job.id,
        action: "PIN_MAINTENANCE_ADMITTED", correlationKey: key,
        summary: { jobType: selected, mode: "ONE_GET", maxRequests: 1 },
      }, tx);
      return { status: "ADMITTED" as const, jobId: job.id, kind: selected };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 12_000 });
    if (admitted.status !== "ADMITTED") {
      return { status: admitted.status, growth: "OFF", providerGetsMax: 0 } as const;
    }
    lease = true;
    jobId = admitted.jobId;
    kind = admitted.kind;
    process.env.GROWTH_PIN_MAINTENANCE_JOB_ID = jobId;
    const outcome = await runGrowthWorker({
      onlyJobId: jobId, batchSize: 1,
      workerId: "growth-pin-maintenance", rolloutConfig: ROLLOUT,
    });
    if (outcome.status !== "COMPLETED" || outcome.claimed !== 1 ||
        outcome.succeeded !== 1 || outcome.failed !== 0) {
      throw Error("PIN_MAINTENANCE_JOB_FAILED");
    }
  } finally {
    delete process.env.GROWTH_PIN_MAINTENANCE_JOB_ID;
    if (lease) await revokeGrowthWorkerActivation(deadline);
  }
  const [settings, blocking, job] = await Promise.all([
    prisma.growthSettings.findUnique({ where: { id: "global" },
      select: { enabled: true, attributionEnabled: true, workerActivationExpiresAt: true } }),
    countBlockingGrowthJobs(prisma),
    prisma.growthJob.findUnique({ where: { id: jobId! },
      select: { status: true, type: true } }),
  ]);
  if (!settings || settings.enabled || settings.attributionEnabled ||
      settings.workerActivationExpiresAt !== null || blocking !== 0 ||
      job?.status !== GrowthJobStatus.SUCCEEDED || job.type !== kind) {
    throw Error("PIN_MAINTENANCE_POSTCONDITION_FAILED");
  }
  return { status: kind === GrowthJobType.PINTEREST_PIN_INVENTORY_SYNC
    ? "INVENTORY_SUCCEEDED" : "PIN_SUCCEEDED",
    growth: "OFF", providerGetsMax: 1 } as const;
}

async function main() {
  try {
    const now = new Date();
    assertPinMaintenanceRuntime(process.env, readFileSync(".deployed-release", "utf8").trim(), {
      username: os.userInfo().username, uid: process.getuid?.() ?? -1,
      cwd: process.cwd(), node: process.execPath,
    }, now);
    const result = await runBoundedPinMaintenance(now);
    console.log("GROWTH_PIN_MAINTENANCE=" + result.status);
    console.log("GROWTH_PIN_MAINTENANCE_GROWTH=" + result.growth);
    console.log("GROWTH_PIN_MAINTENANCE_PROVIDER_GET_MAX=" + result.providerGetsMax);
    console.log("GROWTH_PIN_MAINTENANCE_PROVIDER_WRITES=0");
    console.log("GROWTH_PIN_MAINTENANCE_AI_CALLS=0");
  } catch {
    console.error("GROWTH_PIN_MAINTENANCE=BLOCKED");
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect().catch(() => { process.exitCode = 1; });
  }
}
if (process.env.GROWTH_PIN_MAINTENANCE_ENTRYPOINT === "true") void main();
