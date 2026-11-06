import {
  GrowthJobStatus,
  GrowthJobType,
  GrowthPinApprovalStatus,
  GrowthPinCandidateStatus,
  GrowthPublicationStatus,
  Prisma,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";

/**
 * 2026-11-06 cutover: historical Creative Lab drafts are deliberately outside
 * recurring publisher admission. Only newly generated candidates qualify.
 */
export const PUBLISHER_FRESH_CANDIDATE_AFTER = new Date("2026-11-06T20:53:59.000Z");
const ACTIVE = [
  GrowthJobStatus.PENDING,
  GrowthJobStatus.CLAIMED,
  GrowthJobStatus.RUNNING,
  GrowthJobStatus.FAILED_RETRYABLE,
];

type QueueReader = Pick<Prisma.TransactionClient, "growthJob" | "growthPinPublication">;

/**
 * A future, owner-approved Pin's PENDING job is not a free-running Growth
 * process. Existing daily OBSERVE/intelligence must be able to coexist with
 * it, but any other active job (including reconciliation or retry) blocks.
 *
 * This helper DOES NOT grant any permission to claim or execute these jobs.
 * Publishing has a separate strict per-job admission/lease/policy gate.
 */
export async function countBlockingGrowthJobs(
  db: QueueReader = prisma,
  excludedJobIds: readonly string[] = [],
): Promise<number> {
  const jobs = await db.growthJob.findMany({
    where: { status: { in: ACTIVE }, ...(excludedJobIds.length ? { id: { notIn: [...excludedJobIds] } } : {}) },
    select: { id: true, type: true, status: true, attemptCount: true, runAfter: true },
    take: 101,
  });
  if (jobs.length > 100) return jobs.length;

  const pending = jobs.filter(job =>
    job.status === GrowthJobStatus.PENDING &&
    job.type === GrowthJobType.PINTEREST_PIN_PUBLISH &&
    job.attemptCount === 0,
  );
  const publications = pending.length
    ? await db.growthPinPublication.findMany({
      where: { publishJobId: { in: pending.map(job => job.id) } },
      select: {
        publishJobId: true, scheduledAt: true, candidateId: true,
        status: true, accountId: true, boardId: true,
        approval: {
          select: {
            candidateId: true, approvedById: true, reviewedAt: true,
            status: true, scheduledAt: true, accountId: true,
            boardId: true, candidateRevision: true,
          },
        },
        candidate: { select: { status: true, revision: true, createdAt: true } },
      },
    })
    : [];
  const byJob = new Map(publications.map(publication => [publication.publishJobId, publication]));
  let blockers = 0;
  for (const job of jobs) {
    const row = byJob.get(job.id);
    if (job.type !== GrowthJobType.PINTEREST_PIN_PUBLISH ||
        job.status !== GrowthJobStatus.PENDING ||
        job.attemptCount !== 0 ||
        !row || row.status !== GrowthPublicationStatus.SCHEDULED ||
        row.candidate.createdAt < PUBLISHER_FRESH_CANDIDATE_AFTER ||
        row.candidate.status !== GrowthPinCandidateStatus.READY ||
        row.approval.status !== GrowthPinApprovalStatus.APPROVED ||
        !row.approval.approvedById || !row.approval.reviewedAt ||
        row.approval.candidateId !== row.candidateId ||
        row.approval.accountId !== row.accountId ||
        row.approval.boardId !== row.boardId ||
        row.approval.candidateRevision !== row.candidate.revision ||
        row.approval.scheduledAt?.getTime() !== row.scheduledAt.getTime() ||
        job.runAfter.getTime() !== row.scheduledAt.getTime()) {
      blockers++;
    }
  }
  return blockers;
}
