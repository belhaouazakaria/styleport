import { missingPinterestScopes } from "@/lib/growth/pinterest/config";
import { GrowthJob, GrowthJobStatus, GrowthJobType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { countBlockingGrowthJobs } from "@/lib/growth/operations/approved-publication-queue";
import { revokeGrowthWorkerActivation } from "@/lib/growth/settings";
import { runGrowthWorker } from "@/lib/growth/worker";

/** Recognize an existing inventory read, never create or reset a job. */
export function inventoryReadAccount(
  job: Pick<
    GrowthJob,
    | "type"
    | "status"
    | "payload"
    | "idempotencyKey"
    | "createdAt"
    | "attemptCount"
    | "maxAttempts"
    | "claimedAt"
    | "leaseUntil"
    | "heartbeatAt"
    | "workerId"
    | "completedAt"
  >,
) {
  if (
    ![GrowthJobStatus.PENDING, GrowthJobStatus.FAILED_RETRYABLE].includes(
      job.status as "PENDING" | "FAILED_RETRYABLE",
    ) ||
    job.attemptCount >= job.maxAttempts ||
    (job.attemptCount === 0 &&
      (job.claimedAt || job.heartbeatAt || job.workerId)) ||
    job.leaseUntil ||
    job.completedAt
  )
    return null;
  const kind =
    job.type === GrowthJobType.PINTEREST_ACCOUNT_SYNC
      ? "account"
      : job.type === GrowthJobType.PINTEREST_BOARD_SYNC
        ? "board"
        : null;
  const payload = job.payload;
  if (
    !kind ||
    !payload ||
    typeof payload !== "object" ||
    Array.isArray(payload) ||
    Object.keys(payload).length !== 1 ||
    typeof payload.accountId !== "string" ||
    !/^[a-z0-9]{10,40}$/.test(payload.accountId)
  )
    return null;
  const prefix = `pinterest:${kind}-sync:${payload.accountId}:`;
  const minute = job.idempotencyKey.slice(prefix.length);
  if (
    !job.idempotencyKey.startsWith(prefix) ||
    !/^\d{7,10}$/.test(minute) ||
    Math.abs(Number(minute) - Math.floor(job.createdAt.getTime() / 60000)) > 1
  )
    return null;
  return payload.accountId;
}

/** Isolated exact-ID OBSERVE lease. Approved Pin jobs may coexist, but are
 * never claimed here. All executing, malformed or unrelated work blocks. */
export async function consumeQueuedPinterestInventory(now = new Date()) {
  const deadline = new Date(now.getTime() + 150000);
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
      const jobs = await tx.growthJob.findMany({
        where: {
          status: { in: ["PENDING", "FAILED_RETRYABLE"] },
          type: { in: ["PINTEREST_ACCOUNT_SYNC", "PINTEREST_BOARD_SYNC"] },
        },
        orderBy: [{ runAfter: "asc" }, { id: "asc" }],
        take: 7,
      });
      if (!jobs.length || jobs.length > 6) return null;
      const reads = jobs.map((job) => ({
        job,
        accountId: inventoryReadAccount(job),
      }));
      if (reads.some((r) => !r.accountId)) return null;
      const accounts = await tx.growthPinterestAccount.findMany({
        where: {
          id: { in: reads.map((r) => r.accountId!) },
          apiEnvironment: "PRODUCTION",
          connectionStatus: "CONNECTED",
        },
        select: {
          id: true,
          grantedScopes: true,
          encryptedCredentials: true,
          accessTokenExpiresAt: true,
          refreshTokenExpiresAt: true,
        },
      });
      const healthy = new Set(
        accounts
          .filter(
            (a) =>
              a.encryptedCredentials &&
              missingPinterestScopes(a.grantedScopes).length === 0 &&
              a.accessTokenExpiresAt &&
              a.accessTokenExpiresAt.getTime() > now.getTime() + 10 * 60000 &&
              (!a.refreshTokenExpiresAt || a.refreshTokenExpiresAt > now),
          )
          .map((a) => a.id),
      );
      if (
        reads.some((r) => !healthy.has(r.accountId!)) ||
        (await countBlockingGrowthJobs(
          tx,
          jobs.map((j) => j.id),
        ))
      )
        return null;
      const next = jobs.find((j) => j.runAfter <= now);
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
      workerId: "growth-v2-inventory-read",
      rolloutConfig: {
        GROWTH_WORKER_RUN_ENABLED: "true",
        GROWTH_ROLLOUT_MODE: "INVENTORY",
        GROWTH_INVENTORY_READ_SCOPE: "true",
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
