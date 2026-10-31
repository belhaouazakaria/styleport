import { readFileSync } from "node:fs";
import os from "node:os";
import { GrowthActivityActorKind, GrowthJobStatus, GrowthJobType, Prisma } from "@prisma/client";

import { MAX_GROWTH_ACTIVATION_LEASE_MS } from "@/lib/growth/activation-lease";
import { recordGrowthActivity } from "@/lib/growth/activity";
import { prisma } from "@/lib/prisma";
import { revokeGrowthWorkerActivation } from "@/lib/growth/settings";
import { runGrowthWorker } from "@/lib/growth/worker";

const APP = "/home/saytwist/htdocs/saytwist.com";
const NODE = "/home/saytwist/.nvm/versions/node/v24.20.0/bin/node";
const ACTIVE = [
  GrowthJobStatus.PENDING, GrowthJobStatus.CLAIMED,
  GrowthJobStatus.RUNNING, GrowthJobStatus.FAILED_RETRYABLE,
];
const LEASE_MS = 120_000;
const ROLLOUT = { GROWTH_WORKER_RUN_ENABLED: "true", GROWTH_ROLLOUT_MODE: "OBSERVE" };
const OFF_FLAGS = [
  "GROWTH_WORKER_RUN_ENABLED", "GROWTH_DAILY_REPORT_SCHEDULE_ENABLED",
  "TELEGRAM_REPORTS_ENABLED", "GROWTH_ATTRIBUTION_COLLECTION_ENABLED",
];

export function assertObserveTrialRuntime(
  env: Record<string, string | undefined>,
  deployedRelease: string,
  identity: { username: string; uid: number; cwd: string; node: string },
) {
  const sha = env.EXPECTED_RELEASE || "";
  if (!/^[a-f0-9]{40}$/.test(sha) || sha !== deployedRelease ||
      env.GROWTH_OBSERVE_TRIAL_APPROVAL !== "RUN SAYTWIST GROWTH OBSERVE ONE SHOT " + sha) {
    throw Error("RELEASE_OR_APPROVAL");
  }
  if (identity.username !== "saytwist" || identity.uid === 0 ||
      identity.cwd !== APP || identity.node !== NODE ||
      env.NODE_ENV !== "production") throw Error("HOST_IDENTITY");
  for (const flag of OFF_FLAGS) if (env[flag] === "true") throw Error("AUTOMATION_NOT_OFF");
  if (env.GROWTH_ROLLOUT_MODE === "OBSERVE" ||
      env.GROWTH_ROLLOUT_MODE === "RECOMMEND") throw Error("ROLLOUT_NOT_OFF");
  let target: URL;
  try { target = new URL(env.DATABASE_URL || ""); }
  catch { throw Error("DB_TARGET"); }
  if (!["postgres:", "postgresql:"].includes(target.protocol) ||
      target.hostname !== "127.0.0.1" || target.port !== "5433" ||
      decodeURIComponent(target.pathname.slice(1)) !== "saytwist" ||
      target.searchParams.has("host") || !target.username) throw Error("DB_TARGET");
  if (LEASE_MS > MAX_GROWTH_ACTIVATION_LEASE_MS) throw Error("LEASE_LIMIT");
  return sha;
}

/**
 * Exactly one no-provider job. Transactionally admits the job and activates a
 * short DB lease. The normal scoped worker revokes the lease in finally; this
 * operator wrapper independently retries that CAS on every ordinary exit.
 * A hard kill is covered by the separately installed expiry watchdog.
 */
export async function runObserveTrial(sha: string) {
  if (!/^[a-f0-9]{40}$/.test(sha)) throw Error("RELEASE_INVALID");
  const before = await prisma.growthSettings.findUnique({
    where: { id: "global" },
    select: { enabled: true, attributionEnabled: true, workerActivationExpiresAt: true },
  });
  if (!before || before.enabled || before.attributionEnabled ||
      before.workerActivationExpiresAt !== null ||
      await prisma.growthJob.count({ where: { status: { in: ACTIVE } } }) !== 0) {
    throw Error("PRECONDITION_FAILED");
  }

  const deadline = new Date(Date.now() + LEASE_MS);
  let admitted = false;
  let jobId: string | undefined;
  try {
    jobId = await prisma.$transaction(async tx => {
      const settings = await tx.growthSettings.findUnique({
        where: { id: "global" },
        select: { enabled: true, attributionEnabled: true, workerActivationExpiresAt: true },
      });
      if (!settings || settings.enabled || settings.attributionEnabled ||
          settings.workerActivationExpiresAt !== null ||
          await tx.growthJob.count({ where: { status: { in: ACTIVE } } }) !== 0) {
        throw Error("TRANSACTION_PRECONDITION_FAILED");
      }
      const updated = await tx.growthSettings.updateMany({
        where: {
          id: "global", enabled: false, attributionEnabled: false,
          workerActivationExpiresAt: null,
        },
        data: {
          enabled: true, workerActivationExpiresAt: deadline,
          configVersion: { increment: 1 },
        },
      });
      if (updated.count !== 1) throw Error("ADMISSION_RACE");
      const job = await tx.growthJob.create({
        data: {
          type: GrowthJobType.FOUNDATION_NOOP,
          idempotencyKey: "growth-observe-trial:" + sha,
          payload: {},
          maxAttempts: 1,
        },
        select: { id: true },
      });
      await recordGrowthActivity({
        actorKind: GrowthActivityActorKind.SYSTEM,
        entityType: "GrowthSettings", entityId: "global",
        action: "WORKER_ACTIVATION_ONE_SHOT",
        fromState: "DISABLED", toState: "ENABLED",
        summary: { mode: "OBSERVE", jobType: "FOUNDATION_NOOP", deadline },
        correlationKey: "growth-observe-trial:" + sha,
      }, tx);
      await recordGrowthActivity({
        actorKind: GrowthActivityActorKind.SYSTEM,
        entityType: "GrowthJob", entityId: job.id,
        action: "JOB_CREATED", toState: "PENDING",
        summary: { type: "FOUNDATION_NOOP", maxAttempts: 1 },
        correlationKey: "growth-observe-trial:" + sha,
      }, tx);
      return job.id;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10_000 });

    admitted = true;
    const outcome = await runGrowthWorker({
      onlyJobId: jobId, batchSize: 1,
      workerId: "phase14c-observe-trial",
      rolloutConfig: ROLLOUT,
    });
    if (outcome.status !== "COMPLETED" || outcome.claimed !== 1 ||
        outcome.succeeded !== 1 || outcome.failed !== 0) throw Error("WORKER_UNEXPECTED");

  } finally {
    if (admitted) await revokeGrowthWorkerActivation(deadline);
  }

  const [settings, job, activeCount] = await Promise.all([
    prisma.growthSettings.findUnique({
      where: { id: "global" },
      select: { enabled: true, attributionEnabled: true, workerActivationExpiresAt: true },
    }),
    prisma.growthJob.findUnique({ where: { id: jobId! }, select: { status: true, type: true } }),
    prisma.growthJob.count({ where: { status: { in: ACTIVE } } }),
  ]);
  if (!settings || settings.enabled || settings.attributionEnabled ||
      settings.workerActivationExpiresAt !== null ||
      job?.status !== GrowthJobStatus.SUCCEEDED ||
      job.type !== GrowthJobType.FOUNDATION_NOOP || activeCount !== 0) {
    throw Error("POSTCONDITION_FAILED");
  }
  return { job: "SUCCEEDED", growth: "OFF", lease: "NONE", activeQueue: 0 } as const;
}

async function main() {
  let stage = "RUNTIME";
  try {
    const sha = assertObserveTrialRuntime(
      process.env,
      readFileSync(".deployed-release", "utf8").trim(),
      {
        username: os.userInfo().username,
        uid: process.getuid?.() ?? -1,
        cwd: process.cwd(),
        node: process.execPath,
      },
    );
    stage = "ONE_SHOT";
    const result = await runObserveTrial(sha);
    console.log("GROWTH_OBSERVE_TRIAL=PASSED");
    console.log("GROWTH_OBSERVE_TRIAL_JOB=" + result.job);
    console.log("GROWTH_OBSERVE_TRIAL_GROWTH=" + result.growth);
    console.log("GROWTH_OBSERVE_TRIAL_LEASE=" + result.lease);
    console.log("GROWTH_OBSERVE_TRIAL_ACTIVE_QUEUE=" + result.activeQueue);
  } catch {
    console.error("GROWTH_OBSERVE_TRIAL=BLOCKED");
    console.error("GROWTH_OBSERVE_TRIAL_STAGE=" + stage);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect().catch(() => {
      console.error("GROWTH_OBSERVE_TRIAL_DISCONNECT=FAILED");
      process.exitCode = 1;
    });
  }
}

if (process.env.GROWTH_OBSERVE_TRIAL_ENTRYPOINT === "true") void main();
