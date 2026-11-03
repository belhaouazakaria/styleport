import { readFileSync } from "node:fs";
import os from "node:os";
import { GrowthActivityActorKind, GrowthJobStatus, GrowthJobType, Prisma } from "@prisma/client";

import { recordGrowthActivity } from "@/lib/growth/activity";
import { prisma } from "@/lib/prisma";
import { revokeGrowthWorkerActivation } from "@/lib/growth/settings";
import { runGrowthWorker } from "@/lib/growth/worker";
import { OPPORTUNITY_INTELLIGENCE_VERSION } from "@/lib/growth/opportunity/constants";
import { LEARNING_MODEL_VERSION } from "@/lib/growth/learning/constants";

const APP = "/home/saytwist/htdocs/saytwist.com";
const NODE = "/home/saytwist/.nvm/versions/node/v24.20.0/bin/node";
const LEASE_MS = 120_000;
const ROLLOUT = { GROWTH_WORKER_RUN_ENABLED: "true", GROWTH_ROLLOUT_MODE: "RECOMMEND" };
const ACTIVE = [GrowthJobStatus.PENDING, GrowthJobStatus.CLAIMED,
  GrowthJobStatus.RUNNING, GrowthJobStatus.FAILED_RETRYABLE];

/**
 * Three local-only, one-at-a-time daily analysis jobs. No Pinterest transport,
 * paid AI, content modification, publication, Telegram or attribution. Each
 * job is explicitly scoped by ID and has a distinct one-day idempotency key.
 */
export function planAutonomousGrowthCycle(day: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw Error("DAY_INVALID");
  const parsed = new Date(day + "T00:00:00.000Z");
  if (!Number.isFinite(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== day) throw Error("DAY_INVALID");
  const yesterday = new Date(parsed.getTime() - 86_400_000).toISOString().slice(0, 10);
  const key = "growth-cycle-v1:" + day + ":";
  return [
    {
      type: GrowthJobType.ACCOUNT_STRATEGY_REVIEW, idempotencyKey: key + "strategy",
      payload: { reviewMonth: day.slice(0, 7), evidenceWindowEnd: yesterday,
        modelVersion: "account_strategy_v1" },
    },
    {
      type: GrowthJobType.OPPORTUNITY_INTELLIGENCE_ANALYSIS,
      idempotencyKey: key + "opportunity",
      payload: { analysisDate: day, modelVersion: OPPORTUNITY_INTELLIGENCE_VERSION },
    },
    {
      type: GrowthJobType.EVERGREEN_LEARNING_ANALYSIS, idempotencyKey: key + "learning",
      payload: { analysisDate: day, learningModelVersion: LEARNING_MODEL_VERSION },
    },
  ] as const;
}

export function assertAutonomousCycleRuntime(
  env: Record<string, string | undefined>,
  release: string,
  identity: { username: string; uid: number; cwd: string; node: string },
  now = new Date(),
) {
  const sha = env.EXPECTED_RELEASE || "";
  const day = env.GROWTH_AUTONOMOUS_CYCLE_DATE || "";
  const mode = env.GROWTH_AUTONOMOUS_CYCLE_MODE || "SCHEDULED";
  const approval = mode === "TRIAL"
    ? "RUN SAYTWIST GROWTH CYCLE TRIAL " + sha
    : "SAYTWIST_GROWTH_CYCLE_SCHEDULED:" + sha;
  if (!/^[a-f0-9]{40}$/.test(sha) || sha !== release ||
      env.NODE_ENV !== "production" || day !== now.toISOString().slice(0, 10) ||
      !["TRIAL", "SCHEDULED"].includes(mode) ||
      env.GROWTH_AUTONOMOUS_CYCLE_ENABLED !== "true" ||
      env.GROWTH_AUTONOMOUS_CYCLE_APPROVAL !== approval) {
    throw Error("RELEASE_OR_APPROVAL");
  }
  if (identity.username !== "saytwist" || identity.uid === 0 ||
      identity.cwd !== APP || identity.node !== NODE) throw Error("IDENTITY");
  // Only a separately authenticated owner-triggered one-shot may bypass
  // the normal calendar window. This does not lift the job/lease/kill switches.
  if (mode === "SCHEDULED" &&
      !(now.getUTCHours() === 4 && now.getUTCMinutes() >= 30 && now.getUTCMinutes() < 50)) {
    throw Error("WINDOW_INVALID");
  }
  for (const flag of ["GROWTH_WORKER_RUN_ENABLED",
    "GROWTH_DAILY_REPORT_SCHEDULE_ENABLED", "TELEGRAM_REPORTS_ENABLED",
    "GROWTH_ATTRIBUTION_COLLECTION_ENABLED"]) {
    if (env[flag] === "true") throw Error("OTHER_AUTOMATION_ENABLED");
  }
  if (env.GROWTH_ROLLOUT_MODE === "OBSERVE" ||
      env.GROWTH_ROLLOUT_MODE === "RECOMMEND") throw Error("ROLLOUT_NOT_OFF");
  let target: URL;
  try { target = new URL(env.DATABASE_URL || ""); } catch { throw Error("DB_INVALID"); }
  if (!["postgres:", "postgresql:"].includes(target.protocol) ||
      target.hostname !== "127.0.0.1" || target.port !== "5433" ||
      decodeURIComponent(target.pathname.slice(1)) !== "saytwist" ||
      target.searchParams.has("host") || !target.username) throw Error("DB_INVALID");
  planAutonomousGrowthCycle(day);
  return { sha, day };
}

async function requireStopped() {
  const settings = await prisma.growthSettings.findUnique({
    where: { id: "global" },
    select: { enabled: true, attributionEnabled: true, workerActivationExpiresAt: true },
  });
  const activeCount = await prisma.growthJob.count({ where: { status: { in: ACTIVE } } });
  if (!settings || settings.enabled || settings.attributionEnabled ||
      settings.workerActivationExpiresAt !== null || activeCount !== 0) {
    throw Error("CYCLE_NOT_IDLE");
  }
}

export async function executeAutonomousGrowthCycle(day: string) {
  const jobs = planAutonomousGrowthCycle(day);
  await requireStopped();
  let completed = 0;
  let reused = 0;
  for (const spec of jobs) {
    await requireStopped();
    const prior = await prisma.growthJob.findUnique({
      where: { idempotencyKey: spec.idempotencyKey },
      select: { id: true, type: true, status: true },
    });
    if (prior) {
      if (prior.type !== spec.type || prior.status !== GrowthJobStatus.SUCCEEDED) {
        throw Error("CYCLE_PREVIOUS_OUTCOME_UNSAFE");
      }
      reused++;
      continue;
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
          throw Error("CYCLE_TRANSACTION_NOT_IDLE");
        }
        const updated = await tx.growthSettings.updateMany({
          where: { id: "global", enabled: false, attributionEnabled: false,
            workerActivationExpiresAt: null },
          data: { enabled: true, workerActivationExpiresAt: deadline,
            configVersion: { increment: 1 } },
        });
        if (updated.count !== 1) throw Error("CYCLE_ADMISSION_RACE");
        const job = await tx.growthJob.create({
          data: { type: spec.type, idempotencyKey: spec.idempotencyKey,
            payload: spec.payload, maxAttempts: 1 },
          select: { id: true },
        });
        await recordGrowthActivity({
          actorKind: GrowthActivityActorKind.SYSTEM, entityType: "GrowthJob",
          entityId: job.id, action: "JOB_CREATED", toState: "PENDING",
          correlationKey: spec.idempotencyKey,
          summary: { type: spec.type, maxAttempts: 1, cycle: "growth_cycle_v1" },
        }, tx);
        return job.id;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10_000 });
      admitted = true;

      const outcome = await runGrowthWorker({
        onlyJobId: jobId, batchSize: 1,
        workerId: "growth-cycle-v1-" + spec.type.toLowerCase(),
        rolloutConfig: ROLLOUT,
      });
      if (outcome.status !== "COMPLETED" || outcome.claimed !== 1 ||
          outcome.succeeded !== 1 || outcome.failed !== 0) throw Error("CYCLE_WORKER_FAILED");
    } finally {
      if (admitted) await revokeGrowthWorkerActivation(deadline);
    }
    const [job, settings, remaining] = await Promise.all([
      prisma.growthJob.findUnique({ where: { id: jobId! },
        select: { type: true, status: true } }),
      prisma.growthSettings.findUnique({ where: { id: "global" },
        select: { enabled: true, workerActivationExpiresAt: true } }),
      prisma.growthJob.count({ where: { status: { in: ACTIVE } } }),
    ]);
    if (job?.type !== spec.type || job.status !== GrowthJobStatus.SUCCEEDED ||
        !settings || settings.enabled || settings.workerActivationExpiresAt !== null ||
        remaining !== 0) throw Error("CYCLE_POSTCONDITION_FAILED");
    completed++;
  }
  await requireStopped();
  return { completed, reused, growth: "OFF" as const, lease: "NONE" as const,
    providerCalls: 0, aiCalls: 0, publications: 0 };
}

async function main() {
  try {
    const { day } = assertAutonomousCycleRuntime(
      process.env, readFileSync(".deployed-release", "utf8").trim(),
      { username: os.userInfo().username, uid: process.getuid?.() ?? -1,
        cwd: process.cwd(), node: process.execPath });
    const result = await executeAutonomousGrowthCycle(day);
    console.log("GROWTH_AUTONOMOUS_CYCLE=PASSED");
    console.log("GROWTH_AUTONOMOUS_JOBS_COMPLETED=" + result.completed);
    console.log("GROWTH_AUTONOMOUS_JOBS_REUSED=" + result.reused);
    console.log("GROWTH_AUTONOMOUS_GROWTH=" + result.growth);
    console.log("GROWTH_AUTONOMOUS_LEASE=" + result.lease);
    console.log("GROWTH_AUTONOMOUS_PROVIDER_CALLS=0");
    console.log("GROWTH_AUTONOMOUS_AI_CALLS=0");
    console.log("GROWTH_AUTONOMOUS_PIN_PUBLICATIONS=0");
  } catch {
    console.error("GROWTH_AUTONOMOUS_CYCLE=BLOCKED");
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect().catch(() => { process.exitCode = 1; });
  }
}
if (process.env.GROWTH_AUTONOMOUS_CYCLE_ENTRYPOINT === "true") void main();
