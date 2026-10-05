import { beforeEach, describe, expect, it, vi } from "vitest";

import { GrowthJobStatus, GrowthJobType, Prisma } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  findUnique: vi.fn(),
  findMany: vi.fn(),
  updateMany: vi.fn(),
  transaction: vi.fn(),
  activity: vi.fn(),
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
      growthJob: { updateMany: mocks.updateMany },
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
});
