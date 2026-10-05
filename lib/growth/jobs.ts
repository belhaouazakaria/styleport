import {
  GrowthActivityActorKind,
  GrowthJobStatus,
  GrowthJobType,
  Prisma,
  type GrowthJob,
} from "@prisma/client";

import {
  DEFAULT_GROWTH_LEASE_SECONDS,
  MAX_GROWTH_JOB_ATTEMPTS,
  growthJobPayloadSchema,
} from "@/lib/growth/contracts";
import { recordGrowthActivity } from "@/lib/growth/activity";
import { toSafeGrowthError, toSafeGrowthPayload } from "@/lib/growth/safe-data";
import { prisma } from "@/lib/prisma";

export interface EnqueueGrowthJobInput {
  type: GrowthJobType;
  idempotencyKey: string;
  payload?: unknown;
  runAfter?: Date;
  maxAttempts?: number;
}

export async function enqueueGrowthJob(input: EnqueueGrowthJobInput) {
  const idempotencyKey = input.idempotencyKey.trim();
  if (!idempotencyKey || idempotencyKey.length > 191) {
    throw new Error("Growth job idempotency key must be between 1 and 191 characters.");
  }

  const parsedPayload = growthJobPayloadSchema.safeParse(input.payload || {});
  if (!parsedPayload.success) throw new Error("Invalid Growth job payload.");
  const payload = toSafeGrowthPayload(parsedPayload.data);
  const maxAttempts = Math.min(MAX_GROWTH_JOB_ATTEMPTS, Math.max(1, input.maxAttempts || 3));

  try {
    return await prisma.$transaction(async (tx) => {
      const job = await tx.growthJob.create({
        data: {
          type: input.type,
          idempotencyKey,
          payload: payload as Prisma.InputJsonValue | undefined,
          runAfter: input.runAfter || new Date(),
          maxAttempts,
        },
      });
      await recordGrowthActivity(
        {
          actorKind: GrowthActivityActorKind.SYSTEM,
          entityType: "GrowthJob",
          entityId: job.id,
          action: "JOB_CREATED",
          toState: job.status,
          summary: { type: job.type, runAfter: job.runAfter, maxAttempts: job.maxAttempts },
          correlationKey: idempotencyKey,
        },
        tx,
      );
      return { job, created: true } as const;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await prisma.growthJob.findUnique({ where: { idempotencyKey } });
      if (existing) return { job: existing, created: false } as const;
    }
    throw error;
  }
}

export async function promoteDueGrowthRetries(now = new Date(), limit = 25) {
  const due = await prisma.growthJob.findMany({
    where: { status: GrowthJobStatus.FAILED_RETRYABLE, runAfter: { lte: now } },
    select: { id: true, idempotencyKey: true, attemptCount: true, maxAttempts: true },
    orderBy: [{ runAfter: "asc" }, { createdAt: "asc" }],
    take: Math.min(100, Math.max(1, limit)),
  });
  let promoted = 0;
  for (const job of due) {
    await prisma.$transaction(async (tx) => {
      const updated = await tx.growthJob.updateMany({
        where: { id: job.id, status: GrowthJobStatus.FAILED_RETRYABLE, runAfter: { lte: now } },
        data: { status: GrowthJobStatus.PENDING },
      });
      if (updated.count === 1) {
        promoted += 1;
        await recordGrowthActivity({
          actorKind: GrowthActivityActorKind.SYSTEM,
          entityType: "GrowthJob",
          entityId: job.id,
          action: "JOB_RETRY_READY",
          fromState: GrowthJobStatus.FAILED_RETRYABLE,
          toState: GrowthJobStatus.PENDING,
          summary: { attemptCount: job.attemptCount, maxAttempts: job.maxAttempts },
          correlationKey: job.idempotencyKey,
        }, tx);
      }
    });
  }
  return promoted;
}

export async function recoverStaleGrowthJobs(now = new Date(), limit = 25) {
  const stale = await prisma.growthJob.findMany({
    where: {
      status: { in: [GrowthJobStatus.CLAIMED, GrowthJobStatus.RUNNING] },
      leaseUntil: { lt: now },
    },
    select: { id: true, status: true, attemptCount: true, maxAttempts: true, idempotencyKey: true },
    take: Math.min(100, Math.max(1, limit)),
  });

  let recovered = 0;
  for (const job of stale) {
    const retryable = job.attemptCount < job.maxAttempts;
    const nextStatus = retryable ? GrowthJobStatus.PENDING : GrowthJobStatus.FAILED_TERMINAL;
    await prisma.$transaction(async (tx) => {
      const updated = await tx.growthJob.updateMany({
        where: {
          id: job.id,
          status: job.status,
          leaseUntil: { lt: now },
        },
        data: {
          status: nextStatus,
          workerId: null,
          claimedAt: null,
          leaseUntil: null,
          heartbeatAt: null,
          completedAt: retryable ? null : now,
          lastError: "Worker lease expired before completion.",
        },
      });
      if (updated.count === 1) {
        recovered += 1;
        await recordGrowthActivity({
          actorKind: GrowthActivityActorKind.SYSTEM,
          entityType: "GrowthJob",
          entityId: job.id,
          action: retryable ? "JOB_LEASE_RECOVERED" : "JOB_FAILED_TERMINAL",
          fromState: job.status,
          toState: nextStatus,
          summary: { attemptCount: job.attemptCount, maxAttempts: job.maxAttempts },
          correlationKey: job.idempotencyKey,
        }, tx);
      }
    });
  }

  return recovered;
}

export async function claimNextGrowthJob(params: {
  workerId: string;
  leaseSeconds?: number;
}): Promise<GrowthJob | null> {
  const jobs = await claimGrowthJobs({ ...params, limit: 1 });
  return jobs[0] || null;
}

export async function claimGrowthJobs(params: {
  workerId: string;
  limit: number;
  leaseSeconds?: number;
}): Promise<GrowthJob[]> {
  const leaseSeconds = Math.min(3_600, Math.max(30, params.leaseSeconds || DEFAULT_GROWTH_LEASE_SECONDS));
  const limit = Math.min(100, Math.max(1, params.limit));
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<GrowthJob[]>(Prisma.sql`
      WITH candidates AS (
        SELECT "id"
        FROM "GrowthJob"
        WHERE "status" = 'PENDING'::"GrowthJobStatus"
          AND "runAfter" <= CURRENT_TIMESTAMP
          AND "attemptCount" < "maxAttempts"
        ORDER BY "runAfter" ASC, "createdAt" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT ${limit}
      ), updated AS (
        UPDATE "GrowthJob" AS job
        SET
          "status" = 'CLAIMED'::"GrowthJobStatus",
          "workerId" = ${params.workerId},
          "claimedAt" = CURRENT_TIMESTAMP,
          "leaseUntil" = CURRENT_TIMESTAMP + (${leaseSeconds} * INTERVAL '1 second'),
          "heartbeatAt" = CURRENT_TIMESTAMP,
          "attemptCount" = job."attemptCount" + 1,
          "updatedAt" = CURRENT_TIMESTAMP
        FROM candidates
        WHERE job."id" = candidates."id"
        RETURNING job.*
      )
      SELECT updated.*
      FROM updated
      JOIN "GrowthJob" AS ordering ON ordering."id" = updated."id"
      ORDER BY ordering."runAfter" ASC, ordering."createdAt" ASC
    `);
    for (const job of rows) {
      await recordGrowthActivity(
        {
          actorKind: GrowthActivityActorKind.WORKER,
          entityType: "GrowthJob",
          entityId: job.id,
          action: "JOB_CLAIMED",
          fromState: GrowthJobStatus.PENDING,
          toState: GrowthJobStatus.CLAIMED,
          summary: { workerId: params.workerId, attemptCount: job.attemptCount },
          correlationKey: job.idempotencyKey,
        },
        tx,
      );
    }
    return rows;
  });
}

export async function markGrowthJobRunning(job: GrowthJob, workerId: string) {
  await prisma.$transaction(async (tx) => {
    const updated = await tx.growthJob.updateMany({
      where: { id: job.id, status: GrowthJobStatus.CLAIMED, workerId },
      data: { status: GrowthJobStatus.RUNNING, heartbeatAt: new Date() },
    });
    if (updated.count !== 1) throw new Error("Growth job claim was lost before execution.");
    await recordGrowthActivity({
      actorKind: GrowthActivityActorKind.WORKER,
      entityType: "GrowthJob",
      entityId: job.id,
      action: "JOB_STARTED",
      fromState: GrowthJobStatus.CLAIMED,
      toState: GrowthJobStatus.RUNNING,
      summary: { workerId, attemptCount: job.attemptCount },
      correlationKey: job.idempotencyKey,
    }, tx);
  });
}

export async function releaseClaimedGrowthJob(job: GrowthJob, workerId: string, reason: string) {
  await prisma.$transaction(async (tx) => {
    const updated = await tx.growthJob.updateMany({
      where: { id: job.id, status: GrowthJobStatus.CLAIMED, workerId },
      data: {
        status: GrowthJobStatus.PENDING,
        workerId: null,
        claimedAt: null,
        leaseUntil: null,
        heartbeatAt: null,
        lastError: toSafeGrowthError(reason),
        attemptCount: { decrement: 1 },
      },
    });
    if (updated.count === 1) {
      await recordGrowthActivity({
        actorKind: GrowthActivityActorKind.WORKER,
        entityType: "GrowthJob",
        entityId: job.id,
        action: "JOB_RELEASED_DISABLED",
        fromState: GrowthJobStatus.CLAIMED,
        toState: GrowthJobStatus.PENDING,
        summary: { reason: toSafeGrowthError(reason) },
        correlationKey: job.idempotencyKey,
      }, tx);
    }
  });
}

export async function cancelGrowthJob(jobId: string, actorUserId: string) {
  const job = await prisma.growthJob.findUnique({ where: { id: jobId } });
  if (!job) return null;
  if (job.status !== GrowthJobStatus.PENDING && job.status !== GrowthJobStatus.FAILED_RETRYABLE) {
    throw new Error("Only pending or retryable Growth jobs can be cancelled.");
  }
  await prisma.$transaction(async (tx) => {
    const updated = await tx.growthJob.updateMany({
      where: { id: job.id, status: job.status },
      data: { status: GrowthJobStatus.CANCELLED, completedAt: new Date() },
    });
    if (updated.count !== 1) throw new Error("Growth job state changed before it could be cancelled.");
    await recordGrowthActivity({
      actorKind: GrowthActivityActorKind.USER,
      actorUserId,
      entityType: "GrowthJob",
      entityId: job.id,
      action: "JOB_CANCELLED",
      fromState: job.status,
      toState: GrowthJobStatus.CANCELLED,
      correlationKey: job.idempotencyKey,
    }, tx);
  });
  return { ...job, status: GrowthJobStatus.CANCELLED };
}

export async function completeGrowthJob(job: GrowthJob, workerId: string, summary?: unknown) {
  const completedAt = new Date();
  await prisma.$transaction(async (tx) => {
    const updated = await tx.growthJob.updateMany({
      where: { id: job.id, status: GrowthJobStatus.RUNNING, workerId },
      data: {
        status: GrowthJobStatus.SUCCEEDED,
        completedAt,
        leaseUntil: null,
        heartbeatAt: completedAt,
        lastError: null,
      },
    });
    if (updated.count !== 1) throw new Error("Growth job could not be completed because its claim is no longer active.");
    await recordGrowthActivity({
      actorKind: GrowthActivityActorKind.WORKER,
      entityType: "GrowthJob",
      entityId: job.id,
      action: "JOB_COMPLETED",
      fromState: GrowthJobStatus.RUNNING,
      toState: GrowthJobStatus.SUCCEEDED,
      summary,
      correlationKey: job.idempotencyKey,
    }, tx);
  });
}

export async function failGrowthJob(job: GrowthJob, workerId: string, error: unknown) {
  const retryable = job.attemptCount < job.maxAttempts;
  const status = retryable ? GrowthJobStatus.FAILED_RETRYABLE : GrowthJobStatus.FAILED_TERMINAL;
  const now = new Date();
  const retryDelayMs = Math.min(30 * 60_000, 30_000 * 2 ** Math.max(0, job.attemptCount - 1));
  const safeError = toSafeGrowthError(error);
  await prisma.$transaction(async (tx) => {
    const updated = await tx.growthJob.updateMany({
      where: { id: job.id, status: GrowthJobStatus.RUNNING, workerId },
      data: {
        status,
        runAfter: retryable ? new Date(now.getTime() + retryDelayMs) : job.runAfter,
        completedAt: retryable ? null : now,
        leaseUntil: null,
        heartbeatAt: now,
        lastError: safeError,
      },
    });
    if (updated.count !== 1) throw new Error("Growth job failure could not be persisted because its claim is no longer active.");
    await recordGrowthActivity({
      actorKind: GrowthActivityActorKind.WORKER,
      entityType: "GrowthJob",
      entityId: job.id,
      action: retryable ? "JOB_RETRY_SCHEDULED" : "JOB_FAILED_TERMINAL",
      fromState: GrowthJobStatus.RUNNING,
      toState: status,
      summary: { error: safeError, attemptCount: job.attemptCount, maxAttempts: job.maxAttempts },
      correlationKey: job.idempotencyKey,
    }, tx);
  });
  return status;
}
