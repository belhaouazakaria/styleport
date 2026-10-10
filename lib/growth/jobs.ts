import {
  GrowthActivityActorKind,
  GrowthDecisionStatus,
  GrowthJobStatus,
  GrowthJobType,
  GrowthOpportunityStatus,
  GrowthPublicationStatus,
  Prisma,
  type GrowthJob,
} from "@prisma/client";

import {
  DEFAULT_GROWTH_LEASE_SECONDS,
  MAX_GROWTH_JOB_ATTEMPTS,
  growthJobPayloadSchema,
} from "@/lib/growth/contracts";
import { recordGrowthActivity } from "@/lib/growth/activity";
import { NonRetryableGrowthJobError, RetryableGrowthJobError } from "@/lib/growth/errors";
import { toSafeGrowthError, toSafeGrowthPayload } from "@/lib/growth/safe-data";
import { prisma } from "@/lib/prisma";

export interface EnqueueGrowthJobInput {
  type: GrowthJobType;
  idempotencyKey: string;
  payload?: unknown;
  runAfter?: Date;
  maxAttempts?: number;
}

async function convergePinterestReconciliation(
  tx: Prisma.TransactionClient,
  publication: { id: string; idempotencyKey: string },
  now: Date,
  code: string,
  summary: string,
) {
  const reconcile = await tx.growthJob.upsert({
    where: { idempotencyKey: `pinterest-reconcile:${publication.id}` },
    update: {},
    create: { type: GrowthJobType.PINTEREST_PIN_RECONCILE, idempotencyKey: `pinterest-reconcile:${publication.id}`, payload: { publicationId: publication.id }, maxAttempts: 4 },
  });
  await tx.growthPinPublication.update({ where: { id: publication.id }, data: { status: GrowthPublicationStatus.RECONCILING, reconciliationStartedAt: now, reconcileJobId: reconcile.id, lastErrorCode: code, lastErrorSummary: summary } });
  return reconcile;
}

async function synchronizeExhaustedPublication(tx: Prisma.TransactionClient, job: Pick<GrowthJob, "id" | "type">, now: Date) {
  if (job.type === GrowthJobType.PINTEREST_PIN_PUBLISH) {
    const publication = await tx.growthPinPublication.findFirst({ where: { publishJobId: job.id, status: GrowthPublicationStatus.FAILED_RETRYABLE }, select: { id: true, idempotencyKey: true } });
    if (!publication) return;
    await tx.growthPinPublication.update({ where: { id: publication.id }, data: { status: GrowthPublicationStatus.FAILED_TERMINAL, lastErrorCode: "PUBLISH_RETRY_EXHAUSTED", lastErrorSummary: "The safe Pinterest publish retry budget was exhausted." } });
    await recordGrowthActivity({ actorKind: GrowthActivityActorKind.SYSTEM, entityType: "GrowthPinPublication", entityId: publication.id, action: "PIN_PUBLICATION_FAILED_TERMINAL", fromState: GrowthPublicationStatus.FAILED_RETRYABLE, toState: GrowthPublicationStatus.FAILED_TERMINAL, summary: { code: "PUBLISH_RETRY_EXHAUSTED", at: now }, correlationKey: publication.idempotencyKey }, tx);
  }
  if (job.type === GrowthJobType.PINTEREST_PIN_RECONCILE) {
    const publication = await tx.growthPinPublication.findFirst({ where: { reconcileJobId: job.id, status: GrowthPublicationStatus.RECONCILING }, select: { id: true, idempotencyKey: true } });
    if (!publication) return;
    await tx.growthPinPublication.update({ where: { id: publication.id }, data: { status: GrowthPublicationStatus.FAILED_TERMINAL, lastErrorCode: "RECONCILIATION_RETRY_EXHAUSTED", lastErrorSummary: "The bounded Pinterest reconciliation retry budget was exhausted." } });
    await recordGrowthActivity({ actorKind: GrowthActivityActorKind.SYSTEM, entityType: "GrowthPinPublication", entityId: publication.id, action: "PIN_RECONCILIATION_FAILED_TERMINAL", fromState: GrowthPublicationStatus.RECONCILING, toState: GrowthPublicationStatus.FAILED_TERMINAL, summary: { code: "RECONCILIATION_RETRY_EXHAUSTED", at: now }, correlationKey: publication.idempotencyKey }, tx);
  }
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
    select: { id: true, type: true, status: true, attemptCount: true, maxAttempts: true, idempotencyKey: true },
    take: Math.min(100, Math.max(1, limit)),
  });

  let recovered = 0;
  for (const job of stale) {
    if (job.type === GrowthJobType.PINTEREST_PIN_PUBLISH) {
      let ambiguousPublishing = false;
      await prisma.$transaction(async (tx) => {
        const publication = await tx.growthPinPublication.findFirst({ where: { publishJobId: job.id, status: "PUBLISHING" }, select: { id: true, idempotencyKey: true } });
        if (!publication) return;
        const updated = await tx.growthJob.updateMany({ where: { id: job.id, status: job.status, leaseUntil: { lt: now } }, data: { status: GrowthJobStatus.FAILED_TERMINAL, workerId: null, claimedAt: null, leaseUntil: null, heartbeatAt: null, completedAt: now, lastError: "Publishing lease expired after the external request may have started; reconciliation required." } });
        if (updated.count !== 1) return;
        const reconcile = await convergePinterestReconciliation(tx, publication, now, "PUBLISH_LEASE_EXPIRED", "The Create Pin outcome is ambiguous after worker lease expiry.");
        await recordGrowthActivity({ actorKind: GrowthActivityActorKind.SYSTEM, entityType: "GrowthPinPublication", entityId: publication.id, action: "PIN_CREATE_OUTCOME_AMBIGUOUS", fromState: "PUBLISHING", toState: "RECONCILING", summary: { publishJobId: job.id, reconcileJobId: reconcile.id }, correlationKey: publication.idempotencyKey }, tx);
        await recordGrowthActivity({ actorKind: GrowthActivityActorKind.SYSTEM, entityType: "GrowthJob", entityId: job.id, action: "JOB_FAILED_TERMINAL", fromState: job.status, toState: GrowthJobStatus.FAILED_TERMINAL, summary: { reason: "PUBLISHING_OUTCOME_AMBIGUOUS" }, correlationKey: job.idempotencyKey }, tx);
        recovered += 1;
        ambiguousPublishing = true;
      });
      if (ambiguousPublishing) continue;
    }
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
        if (!retryable) await synchronizeExhaustedPublication(tx, job as GrowthJob, now);
        if (job.type === GrowthJobType.TRANSLATOR_AUTOPILOT_EXECUTE || job.type === GrowthJobType.IDEA_AUTOPILOT_EXECUTE) {
          const decision = await tx.growthDecision.findFirst({
            where: { executionJobId: job.id, status: GrowthDecisionStatus.EXECUTING },
            select: { id: true, opportunityId: true, idempotencyKey: true },
          });
          if (decision) {
            const decisionStatus = retryable ? GrowthDecisionStatus.FAILED_RETRYABLE : GrowthDecisionStatus.FAILED_TERMINAL;
            const decisionUpdated = await tx.growthDecision.updateMany({
              where: { id: decision.id, status: GrowthDecisionStatus.EXECUTING },
              data: { status: decisionStatus, completedAt: retryable ? null : now, reasonCodes: { push: "EXECUTION_JOB_LEASE_EXPIRED" } },
            });
            if (decisionUpdated.count === 1) {
              if (decision.opportunityId) {
                await tx.growthOpportunity.updateMany({
                  where: {
                    id: decision.opportunityId,
                    status: retryable
                      ? GrowthOpportunityStatus.EVALUATING
                      : { in: [GrowthOpportunityStatus.EVALUATING, GrowthOpportunityStatus.FAILED_RETRYABLE] },
                  },
                  data: retryable
                    ? { status: GrowthOpportunityStatus.FAILED_RETRYABLE }
                    : { status: GrowthOpportunityStatus.FAILED_TERMINAL, closedAt: now },
                });
              }
              await recordGrowthActivity({
                actorKind: GrowthActivityActorKind.SYSTEM,
                entityType: "GrowthDecision",
                entityId: decision.id,
                action: "EXECUTION_JOB_LEASE_EXPIRED",
                fromState: GrowthDecisionStatus.EXECUTING,
                toState: decisionStatus,
                summary: { jobId: job.id, jobType: job.type, attemptCount: job.attemptCount, maxAttempts: job.maxAttempts },
                correlationKey: decision.idempotencyKey,
              }, tx);
            }
          }
        }
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
  if (job.type === GrowthJobType.PINTEREST_PIN_PUBLISH) {
    const ambiguous = await prisma.$transaction(async (tx) => {
      const publication = await tx.growthPinPublication.findFirst({ where: { publishJobId: job.id, status: GrowthPublicationStatus.PUBLISHING }, select: { id: true, idempotencyKey: true } });
      if (!publication) return false;
      const updated = await tx.growthJob.updateMany({
        where: { id: job.id, status: GrowthJobStatus.RUNNING, workerId },
        data: { status: GrowthJobStatus.FAILED_TERMINAL, completedAt: new Date(), leaseUntil: null, heartbeatAt: new Date(), lastError: "Pinterest Create Pin may have completed; reconciliation required." },
      });
      if (updated.count !== 1) throw new Error("Growth job failure could not be persisted because its claim is no longer active.");
      const now = new Date();
      const reconcile = await convergePinterestReconciliation(tx, publication, now, "PUBLISH_HANDLER_OUTCOME_AMBIGUOUS", "The publish handler failed after entering the external-write boundary.");
      await recordGrowthActivity({ actorKind: GrowthActivityActorKind.SYSTEM, entityType: "GrowthPinPublication", entityId: publication.id, action: "PIN_CREATE_OUTCOME_AMBIGUOUS", fromState: GrowthPublicationStatus.PUBLISHING, toState: GrowthPublicationStatus.RECONCILING, summary: { publishJobId: job.id, reconcileJobId: reconcile.id, code: "PUBLISH_HANDLER_OUTCOME_AMBIGUOUS" }, correlationKey: publication.idempotencyKey }, tx);
      await recordGrowthActivity({ actorKind: GrowthActivityActorKind.WORKER, entityType: "GrowthJob", entityId: job.id, action: "JOB_FAILED_TERMINAL", fromState: GrowthJobStatus.RUNNING, toState: GrowthJobStatus.FAILED_TERMINAL, summary: { reason: "PUBLISHING_OUTCOME_AMBIGUOUS" }, correlationKey: job.idempotencyKey }, tx);
      return true;
    });
    if (ambiguous) return GrowthJobStatus.FAILED_TERMINAL;
  }
  const retryable = !(error instanceof NonRetryableGrowthJobError) && job.attemptCount < job.maxAttempts;
  const status = retryable ? GrowthJobStatus.FAILED_RETRYABLE : GrowthJobStatus.FAILED_TERMINAL;
  const now = new Date();
  const retryDelayMs = error instanceof RetryableGrowthJobError && error.retryAfterMs
    ? Math.min(30 * 60_000, Math.max(30_000, error.retryAfterMs))
    : Math.min(30 * 60_000, 30_000 * 2 ** Math.max(0, job.attemptCount - 1));
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
    if (!retryable) await synchronizeExhaustedPublication(tx, job, now);
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
