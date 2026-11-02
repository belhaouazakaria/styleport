import { readFileSync } from "node:fs";
import os from "node:os";
import {
  GrowthActivityActorKind, GrowthJobStatus, GrowthJobType,
  GrowthPinterestApiEnvironment, GrowthPinterestConnectionStatus, Prisma,
} from "@prisma/client";
import { recordGrowthActivity } from "@/lib/growth/activity";
import { prisma } from "@/lib/prisma";
import { revokeGrowthWorkerActivation } from "@/lib/growth/settings";
import { runGrowthWorker } from "@/lib/growth/worker";

const APP = "/home/saytwist/htdocs/saytwist.com";
const NODE = "/home/saytwist/.nvm/versions/node/v24.20.0/bin/node";
const LEASE_MS = 120_000;
const ROLLOUT = { GROWTH_WORKER_RUN_ENABLED: "true", GROWTH_ROLLOUT_MODE: "OBSERVE" };
const ACTIVE: GrowthJobStatus[] = [
  GrowthJobStatus.PENDING, GrowthJobStatus.CLAIMED,
  GrowthJobStatus.RUNNING, GrowthJobStatus.FAILED_RETRYABLE,
];

export function dailyAnalyticsRange(day: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw Error("ANALYTICS_DATE_INVALID");
  const start = new Date(day + "T00:00:00.000Z");
  if (!Number.isFinite(start.getTime()) || start.toISOString().slice(0, 10) !== day) {
    throw Error("ANALYTICS_DATE_INVALID");
  }
  return {
    startDate: new Date(start.getTime() - 7 * 86_400_000).toISOString().slice(0, 10),
    endDate: new Date(start.getTime() - 86_400_000).toISOString().slice(0, 10),
  };
}

export function assertDailyAnalyticsRuntime(
  env: Record<string, string | undefined>, release: string,
  identity: { username: string; uid: number; cwd: string; node: string },
  now = new Date(),
) {
  const sha = env.EXPECTED_RELEASE || "";
  const day = env.GROWTH_DAILY_ANALYTICS_DATE || "";
  if (!/^[a-f0-9]{40}$/.test(sha) || sha !== release ||
      env.GROWTH_DAILY_ANALYTICS_ENABLED !== "true" ||
      env.GROWTH_DAILY_ANALYTICS_APPROVAL !== "SAYTWIST_DAILY_ACCOUNT_ANALYTICS:" + sha ||
      env.NODE_ENV !== "production" || day !== now.toISOString().slice(0, 10) ||
      !(now.getUTCHours() === 0 && now.getUTCMinutes() >= 15 &&
        now.getUTCMinutes() < 35)) throw Error("RELEASE_OR_WINDOW_INVALID");
  if (identity.username !== "saytwist" || identity.uid === 0 ||
      identity.cwd !== APP || identity.node !== NODE) throw Error("IDENTITY_INVALID");
  for (const flag of ["GROWTH_WORKER_RUN_ENABLED",
    "GROWTH_DAILY_REPORT_SCHEDULE_ENABLED", "TELEGRAM_REPORTS_ENABLED",
    "GROWTH_ATTRIBUTION_COLLECTION_ENABLED"]) {
    if (env[flag] === "true") throw Error("AUTOMATION_NOT_OFF");
  }
  if (["OBSERVE", "RECOMMEND", "PREPARE", "APPROVED_PUBLISH"].includes(
    env.GROWTH_ROLLOUT_MODE || "")) throw Error("ROLLOUT_NOT_OFF");
  let db: URL;
  try { db = new URL(env.DATABASE_URL || ""); } catch { throw Error("DB_TARGET"); }
  if (!["postgres:", "postgresql:"].includes(db.protocol) ||
      db.hostname !== "127.0.0.1" || db.port !== "5433" ||
      decodeURIComponent(db.pathname.slice(1)) !== "saytwist" ||
      db.searchParams.has("host") || !db.username) throw Error("DB_TARGET");
  dailyAnalyticsRange(day);
  return { sha, day };
}

export async function runDailyAccountAnalytics(day: string) {
  const dates = dailyAnalyticsRange(day);
  const accounts = await prisma.growthPinterestAccount.findMany({
    where: { connectionStatus: GrowthPinterestConnectionStatus.CONNECTED,
      apiEnvironment: GrowthPinterestApiEnvironment.PRODUCTION },
    select: { id: true, encryptedCredentials: true, refreshTokenExpiresAt: true },
    take: 2,
  });
  if (accounts.length !== 1 || !accounts[0].encryptedCredentials ||
      (accounts[0].refreshTokenExpiresAt &&
        accounts[0].refreshTokenExpiresAt <= new Date(Date.now() + 30 * 60_000))) {
    throw Error("ONE_ACCOUNT_REQUIRED");
  }
  const key = "growth-daily-account-analytics-v1:" + day;
  const existing = await prisma.growthJob.findUnique({
    where: { idempotencyKey: key }, select: { id: true, status: true },
  });
  if (existing) {
    if (existing.status !== GrowthJobStatus.SUCCEEDED) throw Error("PREVIOUS_ANALYTICS_UNSAFE");
    return { status: "REUSED" as const };
  }
  const deadline = new Date(Date.now() + LEASE_MS);
  let admitted = false;
  let jobId: string | null = null;
  try {
    jobId = await prisma.$transaction(async tx => {
      const settings = await tx.growthSettings.findUnique({
        where: { id: "global" },
        select: { enabled: true, attributionEnabled: true, workerActivationExpiresAt: true },
      });
      if (!settings || settings.enabled || settings.attributionEnabled ||
          settings.workerActivationExpiresAt !== null ||
          await tx.growthJob.count({ where: { status: { in: ACTIVE } } }) !== 0) {
        throw Error("ANALYTICS_QUEUE_NOT_IDLE");
      }
      const updated = await tx.growthSettings.updateMany({
        where: { id: "global", enabled: false,
          attributionEnabled: false, workerActivationExpiresAt: null },
        data: { enabled: true, workerActivationExpiresAt: deadline,
          configVersion: { increment: 1 } },
      });
      if (updated.count !== 1) throw Error("ANALYTICS_LEASE_RACE");
      const job = await tx.growthJob.create({
        data: { type: GrowthJobType.PINTEREST_ACCOUNT_ANALYTICS_SYNC,
          idempotencyKey: key, maxAttempts: 1,
          payload: { accountId: accounts[0].id, ...dates } },
        select: { id: true },
      });
      await recordGrowthActivity({
        actorKind: GrowthActivityActorKind.SYSTEM, entityType: "GrowthJob",
        entityId: job.id, action: "JOB_CREATED", toState: "PENDING",
        correlationKey: key,
        summary: { type: GrowthJobType.PINTEREST_ACCOUNT_ANALYTICS_SYNC,
          maxAttempts: 1, scope: "ONE_ACCOUNT_DAILY" },
      }, tx);
      return job.id;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10_000 });
    admitted = true;
    const result = await runGrowthWorker({
      onlyJobId: jobId, batchSize: 1, workerId: "daily-account-analytics",
      rolloutConfig: ROLLOUT,
    });
    if (result.status !== "COMPLETED" || result.claimed !== 1 ||
        result.succeeded !== 1 || result.failed !== 0) throw Error("ANALYTICS_JOB_FAILED");
  } finally {
    if (admitted) await revokeGrowthWorkerActivation(deadline);
  }
  const [status, settings, queue] = await Promise.all([
    prisma.growthJob.findUnique({ where: { id: jobId! }, select: { status: true } }),
    prisma.growthSettings.findUnique({ where: { id: "global" },
      select: { enabled: true, workerActivationExpiresAt: true } }),
    prisma.growthJob.count({ where: { status: { in: ACTIVE } } }),
  ]);
  if (status?.status !== GrowthJobStatus.SUCCEEDED || !settings ||
      settings.enabled || settings.workerActivationExpiresAt !== null || queue !== 0) {
    throw Error("ANALYTICS_POSTCONDITION_INVALID");
  }
  return { status: "SUCCEEDED" as const };
}

async function main() {
  try {
    const { day } = assertDailyAnalyticsRuntime(process.env,
      readFileSync(".deployed-release", "utf8").trim(), {
        username: os.userInfo().username, uid: process.getuid?.() ?? -1,
        cwd: process.cwd(), node: process.execPath,
      });
    const result = await runDailyAccountAnalytics(day);
    console.log("GROWTH_DAILY_ACCOUNT_ANALYTICS=" + result.status);
    console.log("GROWTH_DAILY_ACCOUNT_ANALYTICS_WORKER=OFF");
  } catch {
    console.error("GROWTH_DAILY_ACCOUNT_ANALYTICS=BLOCKED");
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect().catch(() => { process.exitCode = 1; });
  }
}
if (process.env.GROWTH_DAILY_ANALYTICS_ENTRYPOINT === "true") void main();
