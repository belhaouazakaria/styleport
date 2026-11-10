import { GrowthJobStatus, GrowthJobType, type GrowthJob } from "@prisma/client";

/**
 * ONLY the two immutable owner-queued sync requests from 2026-11-09.
 * Rejects unrelated work, retries, claim changes, mismatched account IDs,
 * and rewritten queue payloads rather than clearing or recreating jobs.
 */
type SyncJob = Pick<GrowthJob,
  "id" | "type" | "status" | "idempotencyKey" | "payload" |
  "runAfter" | "attemptCount" | "maxAttempts" | "workerId" |
  "claimedAt" | "leaseUntil" | "heartbeatAt" | "completedAt" | "lastError">;

const QUEUED_MINUTE = new Set(["2026-11-09T22:47", "2026-11-09T22:48"]);

function validated(job: SyncJob) {
  if (!/^[a-zA-Z0-9_-]{1,191}$/.test(job.id) ||
      job.status !== GrowthJobStatus.PENDING ||
      job.attemptCount !== 0 || job.maxAttempts !== 3 ||
      job.workerId !== null || job.claimedAt !== null ||
      job.leaseUntil !== null || job.heartbeatAt !== null ||
      job.completedAt !== null || job.lastError !== null ||
      !(job.runAfter instanceof Date) ||
      !Number.isFinite(job.runAfter.getTime()) ||
      !QUEUED_MINUTE.has(job.runAfter.toISOString().slice(0, 16)) ||
      !job.payload || typeof job.payload !== "object" ||
      Array.isArray(job.payload) || Object.keys(job.payload).length !== 1 ||
      !("accountId" in job.payload)) throw Error("OWNER_SYNC_JOB_CHANGED");
  const accountId = job.payload.accountId;
  if (typeof accountId !== "string" || !/^[a-z0-9]{10,191}$/.test(accountId)) {
    throw Error("OWNER_SYNC_ACCOUNT_INVALID");
  }
  const kind = job.type === GrowthJobType.PINTEREST_BOARD_SYNC ? "board" :
    job.type === GrowthJobType.PINTEREST_ACCOUNT_SYNC ? "account" : null;
  if (!kind || job.idempotencyKey !==
      "pinterest:" + kind + "-sync:" + accountId + ":" +
      Math.floor(job.runAfter.getTime() / 60_000)) {
    throw Error("OWNER_SYNC_JOB_IDENTITY_MISMATCH");
  }
  return { accountId, kind };
}

export function selectOwnerQueuedPinterestSync(
  jobs: readonly SyncJob[],
  stage: "BOARD" | "ACCOUNT",
) {
  if (jobs.length !== (stage === "BOARD" ? 2 : 1)) {
    throw Error("OWNER_SYNC_QUEUE_CHANGED");
  }
  const pairs = jobs.map(job => ({ job, ...validated(job) }));
  const boards = pairs.filter(x => x.kind === "board");
  const accounts = pairs.filter(x => x.kind === "account");
  if (accounts.length !== 1 ||
      boards.length !== (stage === "BOARD" ? 1 : 0) ||
      (boards.length && boards[0].accountId !== accounts[0].accountId)) {
    throw Error("OWNER_SYNC_SCOPE_MISMATCH");
  }
  if (stage === "BOARD" &&
      boards[0].job.runAfter.getTime() !== accounts[0].job.runAfter.getTime()) {
    throw Error("OWNER_SYNC_PAIR_MISMATCH");
  }
  const chosen = stage === "BOARD" ? boards[0] : accounts[0];
  return { jobId: chosen.job.id, accountId: chosen.accountId,
    remaining: stage === "BOARD" ? 2 : 1 };
}
