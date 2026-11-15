import { prisma } from "@/lib/prisma";
import { runGrowthWorker } from "@/lib/growth/worker";
import { revokeGrowthWorkerActivation } from "@/lib/growth/settings";
import { countBlockingGrowthJobs } from "@/lib/growth/operations/approved-publication-queue";

/** One due recovery job, exact ID only. No generic queue sweep. Each official
 * request still passes global transport admission and provider quota gates. */
export async function runAutomaticAnalyticsRecovery(now = new Date()) {
  const deadline = new Date(now.getTime() + 180000);
  let leased = false;
  try {
    const jobId = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "GrowthSettings" WHERE "id" = 'global' FOR UPDATE`;
      const settings = await tx.growthSettings.findUnique({
        where: { id: "global" },
      });
      if (
        !settings ||
        settings.enabled ||
        settings.attributionEnabled ||
        settings.workerActivationExpiresAt
      )
        return null;
      const recoveryJobs = await tx.growthJob.findMany({
        where: {
          type: "PINTEREST_ANALYTICS_GAP_RECOVERY",
          status: { in: ["PENDING", "FAILED_RETRYABLE"] },
        },
        select: { id: true, runAfter: true },
        orderBy: { runAfter: "asc" },
        take: 101,
      });
      if (
        recoveryJobs.length > 100 ||
        (await countBlockingGrowthJobs(
          tx,
          recoveryJobs.map((j) => j.id),
        ))
      )
        return null;
      const next = recoveryJobs.find((j) => j.runAfter <= now);
      if (!next) return null;
      await tx.growthSettings.update({
        where: { id: "global" },
        data: {
          enabled: true,
          workerActivationExpiresAt: deadline,
          configVersion: { increment: 1 },
        },
      });
      return next.id;
    });
    if (!jobId) return { status: "NOT_DUE_OR_BUSY" };
    leased = true;
    const result = await runGrowthWorker({
      onlyJobId: jobId,
      batchSize: 1,
      workerId: "growth-v2-analytics-recovery",
      rolloutConfig: {
        GROWTH_WORKER_RUN_ENABLED: "true",
        GROWTH_ROLLOUT_MODE: "RECOVER",
        GROWTH_AUTOMATIC_BACKFILL_SCOPE: "true",
      },
    });
    return {
      status: result.status,
      succeeded: result.succeeded,
      failed: result.failed,
    };
  } finally {
    if (leased) await revokeGrowthWorkerActivation(deadline);
  }
}
