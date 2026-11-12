import { readFileSync } from "node:fs";
import os from "node:os";
import {
  GrowthActivityActorKind, GrowthJobStatus, GrowthJobType,
  GrowthPinterestApiEnvironment, GrowthPinterestConnectionStatus, Prisma,
} from "@prisma/client";

import { recordGrowthActivity } from "@/lib/growth/activity";
import { countBlockingGrowthJobs } from "@/lib/growth/operations/approved-publication-queue";
import { revokeGrowthWorkerActivation } from "@/lib/growth/settings";
import { runGrowthWorker } from "@/lib/growth/worker";
import { prisma } from "@/lib/prisma";

const APP = "/home/saytwist/htdocs/saytwist.com";
const NODE = "/home/saytwist/.nvm/versions/node/v24.20.0/bin/node";
const LEASE_MS = 180_000;
const ROLLOUT = {
  GROWTH_WORKER_RUN_ENABLED: "true",
  GROWTH_ROLLOUT_MODE: "ANALYTICS",
  GROWTH_DAILY_ANALYTICS_SCOPE: "true",
};

export function assertDailyAccountAnalyticsRuntime(
  env: Record<string, string | undefined>,
  deployedSha: string,
  identity: { username: string; uid: number; cwd: string; node: string },
  now = new Date(),
) {
  const sha = env.EXPECTED_RELEASE || "";
  const day = env.GROWTH_DAILY_ANALYTICS_DAY || "";
  if (!/^[a-f0-9]{40}$/.test(sha) || sha !== deployedSha ||
      env.NODE_ENV !== "production" ||
      env.GROWTH_DAILY_ANALYTICS_ENABLED !== "true" ||
      env.GROWTH_DAILY_ANALYTICS_APPROVAL !==
        "SAYTWIST_DAILY_ACCOUNT_ANALYTICS:" + sha ||
      day !== now.toISOString().slice(0, 10) ||
      !(now.getUTCHours() === 4 && now.getUTCMinutes() >= 20 &&
        now.getUTCMinutes() < 35)) {
    throw Error("DAILY_ANALYTICS_RELEASE_OR_SCHEDULE_INVALID");
  }
  if (identity.username !== "saytwist" || identity.uid === 0 ||
      identity.cwd !== APP || identity.node !== NODE) {
    throw Error("DAILY_ANALYTICS_IDENTITY_INVALID");
  }
  for (const key of [
    "GROWTH_WORKER_RUN_ENABLED", "GROWTH_DAILY_REPORT_SCHEDULE_ENABLED",
    "TELEGRAM_REPORTS_ENABLED", "GROWTH_ATTRIBUTION_COLLECTION_ENABLED",
    "GROWTH_AI_IMAGE_ENABLED",
  ]) if (env[key] === "true") throw Error("DAILY_ANALYTICS_CONFLICTING_AUTOMATION");

  if (env.GROWTH_ROLLOUT_MODE !== "OFF" ||
      env.PINTEREST_API_ENVIRONMENT !== "production" ||
      env.APP_BASE_URL !== "https://saytwist.com") {
    throw Error("DAILY_ANALYTICS_ENV_INVALID");
  }
  const db = new URL(env.DATABASE_URL || "");
  if (![ "postgres:", "postgresql:" ].includes(db.protocol) ||
      db.hostname !== "127.0.0.1" || db.port !== "5433" ||
      decodeURIComponent(db.pathname.slice(1)) !== "saytwist" ||
      db.searchParams.has("host") || !db.username) {
    throw Error("DAILY_ANALYTICS_DATABASE_INVALID");
  }
  return { sha, day };
}

export function completedUtcAnalyticsWindow(day: string, days: 7 | 28 = 7) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw Error("ANALYTICS_DAY_INVALID");
  const today = new Date(day + "T00:00:00.000Z");
  if (Number.isNaN(today.getTime()) || today.toISOString().slice(0, 10) !== day) {
    throw Error("ANALYTICS_DAY_INVALID");
  }
  // Account analytics retains seven completed UTC days. The bounded Pin
  // maintenance reader explicitly requests 28 completed days to recover
  // Opportunity Intelligence evidence within the same single provider GET.
  // Recent data can remain PROCESSING at Pinterest; preserve its status.
  return {
    startDate: new Date(today.getTime() - days * 86_400_000).toISOString().slice(0, 10),
    endDate: new Date(today.getTime() - 86_400_000).toISOString().slice(0, 10),
  };
}

/** At most one exact job per UTC day, with no worker sweep or retry.
 * The global Pinterest transport reserves each actual GET in the shared
 * 4/hour, 16/day API budget and enforces provider header safeguards.
 */
export async function runDailyAccountAnalytics(day: string) {
  const range = completedUtcAnalyticsWindow(day);
  const deadline = new Date(Date.now() + LEASE_MS);
  const key = "growth-daily-account-analytics-v1:" + day;
  let leased = false;
  let jobId: string | null = null;
  try {
    jobId = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "GrowthSettings"
        WHERE "id" = 'global' FOR UPDATE`;
      const [settings, blockers, accounts] = await Promise.all([
        tx.growthSettings.findUnique({
          where: { id: "global" },
          select: { enabled: true, attributionEnabled: true,
            workerActivationExpiresAt: true },
        }),
        countBlockingGrowthJobs(tx),
        tx.growthPinterestAccount.findMany({
          where: {
            apiEnvironment: GrowthPinterestApiEnvironment.PRODUCTION,
            connectionStatus: GrowthPinterestConnectionStatus.CONNECTED,
          },
          select: { id: true, encryptedCredentials: true, grantedScopes: true,
            accessTokenExpiresAt: true, refreshTokenExpiresAt: true },
          take: 2,
        }),
      ]);
      if (!settings || settings.enabled || settings.attributionEnabled ||
          settings.workerActivationExpiresAt !== null ||
          blockers !== 0 || accounts.length !== 1) {
        throw Error("DAILY_ANALYTICS_NOT_IDLE");
      }
      const account = accounts[0];
      if (!account.encryptedCredentials ||
          !account.grantedScopes.includes("user_accounts:read") ||
          !account.accessTokenExpiresAt ||
          account.accessTokenExpiresAt.getTime() <= Date.now() + 20 * 60_000 ||
          (account.refreshTokenExpiresAt &&
            account.refreshTokenExpiresAt.getTime() <= Date.now())) {
        throw Error("DAILY_ANALYTICS_ACCOUNT_NOT_READY");
      }
      const state = await tx.growthPinterestAnalyticsState.findUnique({
        where: { accountId: account.id }, select: { accountId: true },
      });
      if (!state) throw Error("DAILY_ANALYTICS_STATE_MISSING");
      const previous = await tx.growthJob.findUnique({
        where: { idempotencyKey: key }, select: { id: true },
      });
      if (previous) throw Error("DAILY_ANALYTICS_ALREADY_ATTEMPTED");
      const job = await tx.growthJob.create({
        data: { type: GrowthJobType.PINTEREST_ACCOUNT_ANALYTICS_SYNC,
          idempotencyKey: key, maxAttempts: 1,
          payload: { accountId: account.id, ...range,
            runStartedAt: new Date().toISOString() } },
        select: { id: true },
      });
      const changed = await tx.growthSettings.updateMany({
        where: { id: "global", enabled: false, attributionEnabled: false,
          workerActivationExpiresAt: null },
        data: { enabled: true, workerActivationExpiresAt: deadline,
          configVersion: { increment: 1 } },
      });
      if (changed.count !== 1) throw Error("DAILY_ANALYTICS_LEASE_RACE");
      await recordGrowthActivity({
        actorKind: GrowthActivityActorKind.SYSTEM,
        entityType: "GrowthJob", entityId: job.id,
        action: "DAILY_ACCOUNT_ANALYTICS_ADMITTED",
        correlationKey: key,
        summary: { mode: "ONE_ACCOUNT_READ_ONLY", maxAttempts: 1,
          startDate: range.startDate, endDate: range.endDate },
      }, tx);
      return job.id;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10_000 });
    leased = true;
    const result = await runGrowthWorker({
      onlyJobId: jobId, batchSize: 1, workerId: "growth-daily-account-analytics",
      rolloutConfig: ROLLOUT,
    });
    if (result.status !== "COMPLETED" || result.claimed !== 1 ||
        result.succeeded !== 1 || result.failed !== 0) {
      throw Error("DAILY_ANALYTICS_JOB_NOT_SUCCEEDED");
    }
  } finally {
    if (leased) await revokeGrowthWorkerActivation(deadline);
  }
  const [job, settings, active] = await Promise.all([
    prisma.growthJob.findUnique({
      where: { id: jobId! }, select: { status: true, type: true },
    }),
    prisma.growthSettings.findUnique({
      where: { id: "global" },
      select: { enabled: true, attributionEnabled: true,
        workerActivationExpiresAt: true },
    }),
    countBlockingGrowthJobs(prisma),
  ]);
  if (!job || job.type !== GrowthJobType.PINTEREST_ACCOUNT_ANALYTICS_SYNC ||
      job.status !== GrowthJobStatus.SUCCEEDED ||
      !settings || settings.enabled || settings.attributionEnabled ||
      settings.workerActivationExpiresAt !== null || active !== 0) {
    throw Error("DAILY_ANALYTICS_POSTCONDITION_FAILED");
  }
  return { job: "SUCCEEDED" as const, growth: "OFF" as const,
    pinsPublished: 0 as const, aiCalls: 0 as const };
}

async function main() {
  try {
    const { day } = assertDailyAccountAnalyticsRuntime(
      process.env, readFileSync(APP + "/.deployed-release", "utf8").trim(),
      { username: os.userInfo().username, uid: process.getuid?.() ?? -1,
        cwd: process.cwd(), node: process.execPath },
    );
    const result = await runDailyAccountAnalytics(day);
    console.log("GROWTH_DAILY_ACCOUNT_ANALYTICS=" + result.job);
    console.log("GROWTH_DAILY_ACCOUNT_ANALYTICS_GROWTH=" + result.growth);
    console.log("GROWTH_DAILY_ACCOUNT_ANALYTICS_PINS_PUBLISHED=0");
    console.log("GROWTH_DAILY_ACCOUNT_ANALYTICS_AI_CALLS=0");
  } catch {
    console.error("GROWTH_DAILY_ACCOUNT_ANALYTICS=BLOCKED");
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect().catch(() => { process.exitCode = 1; });
  }
}
if (process.env.GROWTH_DAILY_ACCOUNT_ANALYTICS_ENTRYPOINT === "true") void main();
