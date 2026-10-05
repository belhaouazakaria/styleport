import { GrowthWorkerStatus } from "@prisma/client";
import { randomUUID } from "node:crypto";

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
import { getGrowthSettings } from "@/lib/growth/settings";
import { prisma } from "@/lib/prisma";

export interface GrowthWorkerResult {
  status: "DISABLED" | "EMPTY" | "COMPLETED";
  claimed: number;
  succeeded: number;
  failed: number;
}

export async function runGrowthWorker(options: { workerId?: string; batchSize?: number } = {}): Promise<GrowthWorkerResult> {
  const settings = await getGrowthSettings();
  if (!settings.enabled) return { status: "DISABLED", claimed: 0, succeeded: 0, failed: 0 };

  const workerId = (options.workerId || process.env.GROWTH_WORKER_ID || "growth-worker").slice(0, 191);
  const invocationId = randomUUID();
  const leaseOwnerId = `${workerId}:${invocationId}`.slice(0, 191);
  const batchSize = Math.min(
    MAX_GROWTH_WORKER_BATCH_SIZE,
    Math.max(1, options.batchSize || settings.workerBatchSize),
  );
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
    await promoteDueGrowthRetries(startedAt, batchSize);
    await recoverStaleGrowthJobs(startedAt, batchSize);
    const jobs = await claimGrowthJobs({ workerId: leaseOwnerId, limit: batchSize });
    result.claimed = jobs.length;
    if (jobs.length > 0) result.status = "COMPLETED";

    for (let index = 0; index < jobs.length; index += 1) {
      const job = jobs[index];
      const beforeExecution = await getGrowthSettings();
      if (!beforeExecution.enabled) {
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
}
