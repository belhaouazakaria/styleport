import { GrowthWorkerStatus } from "@prisma/client";
import { randomUUID } from "node:crypto";

import { isGrowthWorkerActivationValid } from "@/lib/growth/activation-lease";
import { MAX_GROWTH_WORKER_BATCH_SIZE } from "@/lib/growth/contracts";
import { dispatchGrowthJob } from "@/lib/growth/handlers";
import {
  claimGrowthJobs,
  completeGrowthJob,
  failGrowthJob,
  markGrowthJobRunning,
  promoteDueGrowthRetries,
  recoverStaleGrowthJobs,
  releaseClaimedGrowthJob,
} from "@/lib/growth/jobs";
import { toSafeGrowthError } from "@/lib/growth/safe-data";
import { resolveGrowthRollout } from "@/lib/growth/rollout";
import { getGrowthSettings, revokeGrowthWorkerActivation } from "@/lib/growth/settings";
import { prisma } from "@/lib/prisma";

export interface GrowthWorkerResult {
  status: "DISABLED" | "EMPTY" | "COMPLETED";
  claimed: number;
  succeeded: number;
  failed: number;
}

export async function runGrowthWorker(options: {
  workerId?: string; batchSize?: number; rolloutConfig?: Record<string, string | undefined>;
  /** Restrict this invocation to one specified pending job. Does not override either kill switch. */
  onlyJobId?: string;
} = {}): Promise<GrowthWorkerResult> {
  if (options.onlyJobId !== undefined && !/^[A-Za-z0-9_-]{1,191}$/.test(options.onlyJobId)) {
    throw new Error("Invalid scoped Growth worker job ID.");
  }
  const rollout = resolveGrowthRollout(options.rolloutConfig);
  if (rollout.mode === "OFF") return { status: "DISABLED", claimed: 0, succeeded: 0, failed: 0 };
  const settings = await getGrowthSettings();
  if (!isGrowthWorkerActivationValid(settings)) {
    return { status: "DISABLED", claimed: 0, succeeded: 0, failed: 0 };
  }
  const activationExpiresAt = settings.workerActivationExpiresAt!;

  const workerId = (options.workerId || process.env.GROWTH_WORKER_ID || "growth-worker").slice(0, 191);
  const invocationId = randomUUID();
  const leaseOwnerId = `${workerId}:${invocationId}`.slice(0, 191);
  const batchSize = options.onlyJobId ? 1 : Math.min(
    MAX_GROWTH_WORKER_BATCH_SIZE,
    Math.max(1, options.batchSize || settings.workerBatchSize),
  );
  // A scoped one-shot must revoke the matching lease even on handler or
  // heartbeat failure. A hard crash still expires independently in the DB.
  try {
  const startedAt = new Date();
  await prisma.growthWorkerHeartbeat.upsert({
    where: { workerId },
    create: { workerId, invocationId, status: GrowthWorkerStatus.RUNNING, startedAt, heartbeatAt: startedAt },
    update: {
      invocationId,
      status: GrowthWorkerStatus.RUNNING,
      startedAt,
      heartbeatAt: startedAt,
      completedAt: null,
      currentJobId: null,
      lastError: null,
    },
  });

  const result: GrowthWorkerResult = { status: "EMPTY", claimed: 0, succeeded: 0, failed: 0 };
  try {
    // Scoped trials must not touch unrelated retries or stale leases.
    if (!options.onlyJobId) {
      await promoteDueGrowthRetries(startedAt, batchSize, rollout.allowedTypes);
      await recoverStaleGrowthJobs(startedAt, batchSize, rollout.allowedTypes);
    }
    const beforeClaim = await getGrowthSettings();
    if (!isGrowthWorkerActivationValid(beforeClaim) ||
        beforeClaim.workerActivationExpiresAt?.getTime() !== activationExpiresAt.getTime()) {
      throw new Error("Growth worker activation expired or changed before claim.");
    }
    const jobs = await claimGrowthJobs({
      workerId: leaseOwnerId, limit: batchSize, allowedTypes: rollout.allowedTypes,
      ...(options.onlyJobId ? { jobId: options.onlyJobId } : {}),
    });
    // Defense in depth if a claim implementation ever loses the exact-ID filter.
    if (options.onlyJobId && (jobs.length > 1 || jobs.some(job => job.id !== options.onlyJobId))) {
      for (const claimed of jobs) {
        await releaseClaimedGrowthJob(claimed, leaseOwnerId, "Exact job scope mismatch.");
      }
      throw new Error("Exact Growth job scope violation.");
    }
    result.claimed = jobs.length;
    if (jobs.length > 0) result.status = "COMPLETED";

    for (let index = 0; index < jobs.length; index += 1) {
      const job = jobs[index];
      const beforeExecution = await getGrowthSettings();
      if (!isGrowthWorkerActivationValid(beforeExecution) ||
          beforeExecution.workerActivationExpiresAt?.getTime() !== activationExpiresAt.getTime() ||
          resolveGrowthRollout(options.rolloutConfig).mode !== rollout.mode ||
          !rollout.allowedTypes.includes(job.type)) {
        for (const unexecutedJob of jobs.slice(index)) {
          await releaseClaimedGrowthJob(unexecutedJob, leaseOwnerId, "Growth was disabled before execution.");
        }
        break;
      }

      await prisma.growthWorkerHeartbeat.updateMany({
        where: { workerId, invocationId },
        data: { heartbeatAt: new Date(), currentJobId: job.id },
      });

      try {
        await markGrowthJobRunning(job, leaseOwnerId);
        const summary = await dispatchGrowthJob(job);
        await completeGrowthJob(job, leaseOwnerId, summary);
        result.succeeded += 1;
      } catch (error) {
        await failGrowthJob(job, leaseOwnerId, error);
        result.failed += 1;
      }
    }

    await prisma.growthWorkerHeartbeat.updateMany({
      where: { workerId, invocationId },
      data: {
        status: GrowthWorkerStatus.IDLE,
        heartbeatAt: new Date(),
        completedAt: new Date(),
        currentJobId: null,
      },
    });
    return result;
  } catch (error) {
    await prisma.growthWorkerHeartbeat.updateMany({
      where: { workerId, invocationId },
      data: {
        status: GrowthWorkerStatus.FAILED,
        heartbeatAt: new Date(),
        completedAt: new Date(),
        currentJobId: null,
        lastError: toSafeGrowthError(error),
      },
    });
    throw error;
  }
  } finally {
    if (options.onlyJobId) await revokeGrowthWorkerActivation(activationExpiresAt);
  }
}
