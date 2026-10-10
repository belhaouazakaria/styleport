import { beforeEach, describe, expect, it, vi } from "vitest";

import { GrowthJobStatus, GrowthJobType, Prisma } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  findUnique: vi.fn(),
  findMany: vi.fn(),
  updateMany: vi.fn(),
  transaction: vi.fn(),
  activity: vi.fn(),
  publicationFind: vi.fn(),
  publicationUpdate: vi.fn(),
  jobCreate: vi.fn(),
  jobUpsert: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: mocks.queryRaw,
    $transaction: mocks.transaction,
    growthJob: { findUnique: mocks.findUnique, findMany: mocks.findMany, updateMany: mocks.updateMany },
  },
}));
vi.mock("@/lib/growth/activity", () => ({ recordGrowthActivity: mocks.activity }));

import { claimGrowthJobs, claimNextGrowthJob, enqueueGrowthJob, failGrowthJob, recoverStaleGrowthJobs } from "@/lib/growth/jobs";
import { PinterestConfigurationError } from "@/lib/growth/errors";

const job = {
  id: "job-1",
  type: GrowthJobType.FOUNDATION_NOOP,
  status: GrowthJobStatus.CLAIMED,
  payload: {},
  idempotencyKey: "foundation:same-work",
  runAfter: new Date(),
  attemptCount: 1,
  maxAttempts: 3,
  workerId: "worker-a",
  claimedAt: new Date(),
  leaseUntil: new Date(),
  heartbeatAt: new Date(),
  lastError: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  completedAt: null,
};

describe("Growth job persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.activity.mockResolvedValue({});
    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      $queryRaw: mocks.queryRaw,
      growthJob: { updateMany: mocks.updateMany, findUnique: mocks.findUnique, create: mocks.jobCreate, upsert: mocks.jobUpsert },
      growthPinPublication: { findFirst: mocks.publicationFind, update: mocks.publicationUpdate },
    }));
  });

  it("allows only one concurrent atomic claim result", async () => {
    mocks.queryRaw.mockResolvedValueOnce([job]).mockResolvedValueOnce([]);
    const claims = await Promise.all([
      claimNextGrowthJob({ workerId: "worker-a" }),
      claimNextGrowthJob({ workerId: "worker-b" }),
    ]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    expect(mocks.activity).toHaveBeenCalledTimes(1);
  });

  it("claims a bounded batch with one selection statement", async () => {
    mocks.queryRaw.mockResolvedValue([job, { ...job, id: "job-2" }]);
    const claims = await claimGrowthJobs({ workerId: "worker-a", limit: 2 });
    expect(claims).toHaveLength(2);
    expect(mocks.queryRaw).toHaveBeenCalledTimes(1);
    expect(mocks.activity).toHaveBeenCalledTimes(2);
  });

  it("returns the existing job when the idempotency key conflicts", async () => {
    const conflict = new Prisma.PrismaClientKnownRequestError("unique", { code: "P2002", clientVersion: "6.19.3" });
    mocks.transaction.mockRejectedValue(conflict);
    mocks.findUnique.mockResolvedValue(job);
    const result = await enqueueGrowthJob({ type: GrowthJobType.FOUNDATION_NOOP, idempotencyKey: job.idempotencyKey });
    expect(result).toEqual({ job, created: false });
  });

  it("recovers a stale lease once and records the transition", async () => {
    mocks.findMany.mockResolvedValue([{ id: job.id, status: GrowthJobStatus.RUNNING, attemptCount: 1, maxAttempts: 3, idempotencyKey: job.idempotencyKey }]);
    mocks.updateMany.mockResolvedValue({ count: 1 });
    await expect(recoverStaleGrowthJobs(new Date())).resolves.toBe(1);
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: GrowthJobStatus.PENDING }) }));
    expect(mocks.activity).toHaveBeenCalledWith(expect.objectContaining({ action: "JOB_LEASE_RECOVERED" }), expect.any(Object));
  });

  it("reconciles a stale publishing lease instead of requeuing Create Pin", async () => {
    mocks.findMany.mockResolvedValue([{ id: "publish-job", type: GrowthJobType.PINTEREST_PIN_PUBLISH, status: GrowthJobStatus.RUNNING, attemptCount: 1, maxAttempts: 3, idempotencyKey: "pinterest-publish:publication" }]);
    mocks.publicationFind.mockResolvedValue({ id: "publication", idempotencyKey: "pinterest-publish:publication" });
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.jobUpsert.mockResolvedValue({ id: "reconcile-job" });
    await expect(recoverStaleGrowthJobs(new Date())).resolves.toBe(1);
    expect(mocks.publicationUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "RECONCILING", reconcileJobId: "reconcile-job" }) }));
    expect(mocks.jobUpsert).toHaveBeenCalledTimes(1);
    expect(mocks.updateMany).not.toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: GrowthJobStatus.PENDING }) }));
  });

  it("moves an exhausted job to terminal failure", async () => {
    const exhausted = { ...job, status: GrowthJobStatus.RUNNING, attemptCount: 3, maxAttempts: 3 };
    mocks.updateMany.mockResolvedValue({ count: 1 });
    await expect(failGrowthJob(exhausted, "worker-a", new Error("failed"))).resolves.toBe(GrowthJobStatus.FAILED_TERMINAL);
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: GrowthJobStatus.FAILED_TERMINAL }) }));
    expect(mocks.activity).toHaveBeenCalledWith(expect.objectContaining({ action: "JOB_FAILED_TERMINAL" }), expect.any(Object));
  });

  it("schedules a bounded retry before max attempts", async () => {
    const retryable = { ...job, status: GrowthJobStatus.RUNNING, attemptCount: 1, maxAttempts: 3 };
    mocks.updateMany.mockResolvedValue({ count: 1 });
    await expect(failGrowthJob(retryable, "worker-a", new Error("retry"))).resolves.toBe(GrowthJobStatus.FAILED_RETRYABLE);
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: GrowthJobStatus.FAILED_RETRYABLE, runAfter: expect.any(Date) }) }));
  });

  it("makes missing local Pinterest configuration terminal without another retry", async () => {
    const retryable = { ...job, status: GrowthJobStatus.RUNNING, attemptCount: 1, maxAttempts: 3 };
    mocks.updateMany.mockResolvedValue({ count: 1 });
    await expect(failGrowthJob(retryable, "worker-a", new PinterestConfigurationError("Pinterest is not configured (PINTEREST_APP_ID)."))).resolves.toBe(GrowthJobStatus.FAILED_TERMINAL);
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: GrowthJobStatus.FAILED_TERMINAL }) }));
  });

  it("converts an unexpected PUBLISHING handler failure to reconciliation", async () => {
    const publishing = { ...job, type: GrowthJobType.PINTEREST_PIN_PUBLISH, status: GrowthJobStatus.RUNNING, idempotencyKey: "pinterest-publish:publication" };
    mocks.publicationFind.mockResolvedValue({ id: "publication", idempotencyKey: publishing.idempotencyKey });
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.jobUpsert.mockResolvedValue({ id: "reconcile-job" });
    await expect(failGrowthJob(publishing, "worker-a", new Error("unexpected"))).resolves.toBe(GrowthJobStatus.FAILED_TERMINAL);
    expect(mocks.publicationUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "RECONCILING", lastErrorCode: "PUBLISH_HANDLER_OUTCOME_AMBIGUOUS" }) }));
    expect(mocks.jobUpsert).toHaveBeenCalledTimes(1);
    expect(mocks.updateMany).not.toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: GrowthJobStatus.FAILED_RETRYABLE }) }));
  });

  it("synchronizes exhausted publish and reconciliation retries", async () => {
    const publication = { id: "publication", idempotencyKey: "pinterest-publish:publication" };
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.publicationFind.mockResolvedValueOnce(null).mockResolvedValueOnce(publication);
    await failGrowthJob({ ...job, type: GrowthJobType.PINTEREST_PIN_PUBLISH, status: GrowthJobStatus.RUNNING, attemptCount: 3, maxAttempts: 3 }, "worker-a", new Error("429"));
    expect(mocks.publicationUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "FAILED_TERMINAL", lastErrorCode: "PUBLISH_RETRY_EXHAUSTED" }) }));

    vi.clearAllMocks(); mocks.activity.mockResolvedValue({}); mocks.updateMany.mockResolvedValue({ count: 1 }); mocks.publicationFind.mockResolvedValue(publication);
    await failGrowthJob({ ...job, type: GrowthJobType.PINTEREST_PIN_RECONCILE, status: GrowthJobStatus.RUNNING, attemptCount: 4, maxAttempts: 4 }, "worker-a", new Error("read failed"));
    expect(mocks.publicationUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "FAILED_TERMINAL", lastErrorCode: "RECONCILIATION_RETRY_EXHAUSTED" }) }));
  });

  it("synchronizes exhausted stale publish and reconcile jobs", async () => {
    const publication = { id: "publication", idempotencyKey: "pinterest-publish:publication" };
    mocks.findMany.mockResolvedValue([
      { id: "publish-job", type: GrowthJobType.PINTEREST_PIN_PUBLISH, status: GrowthJobStatus.RUNNING, attemptCount: 3, maxAttempts: 3, idempotencyKey: "publish-job" },
      { id: "reconcile-job", type: GrowthJobType.PINTEREST_PIN_RECONCILE, status: GrowthJobStatus.RUNNING, attemptCount: 4, maxAttempts: 4, idempotencyKey: "reconcile-job" },
    ]);
    mocks.publicationFind.mockResolvedValueOnce(null).mockResolvedValueOnce(publication).mockResolvedValueOnce(publication);
    mocks.updateMany.mockResolvedValue({ count: 1 });
    await expect(recoverStaleGrowthJobs(new Date())).resolves.toBe(2);
    expect(mocks.publicationUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ lastErrorCode: "PUBLISH_RETRY_EXHAUSTED" }) }));
    expect(mocks.publicationUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ lastErrorCode: "RECONCILIATION_RETRY_EXHAUSTED" }) }));
  });
});
