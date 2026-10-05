import { beforeEach, describe, expect, it, vi } from "vitest";

import { GrowthJobStatus, GrowthJobType } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  getGrowthSettings: vi.fn(),
  promoteDueGrowthRetries: vi.fn(),
  recoverStaleGrowthJobs: vi.fn(),
  claimGrowthJobs: vi.fn(),
  markGrowthJobRunning: vi.fn(),
  releaseClaimedGrowthJob: vi.fn(),
  completeGrowthJob: vi.fn(),
  failGrowthJob: vi.fn(),
  dispatchGrowthJob: vi.fn(),
  heartbeatUpsert: vi.fn(),
  heartbeatUpdateMany: vi.fn(),
}));

vi.mock("@/lib/growth/settings", () => ({ getGrowthSettings: mocks.getGrowthSettings }));
vi.mock("@/lib/growth/jobs", () => ({
  promoteDueGrowthRetries: mocks.promoteDueGrowthRetries,
  recoverStaleGrowthJobs: mocks.recoverStaleGrowthJobs,
  claimGrowthJobs: mocks.claimGrowthJobs,
  markGrowthJobRunning: mocks.markGrowthJobRunning,
  releaseClaimedGrowthJob: mocks.releaseClaimedGrowthJob,
  completeGrowthJob: mocks.completeGrowthJob,
  failGrowthJob: mocks.failGrowthJob,
}));
vi.mock("@/lib/growth/handlers", () => ({ dispatchGrowthJob: mocks.dispatchGrowthJob }));
vi.mock("@/lib/prisma", () => ({
  prisma: { growthWorkerHeartbeat: { upsert: mocks.heartbeatUpsert, updateMany: mocks.heartbeatUpdateMany } },
}));

import { runGrowthWorker } from "@/lib/growth/worker";

const settings = { enabled: true, workerBatchSize: 5, intensity: "BALANCED" };
const job = {
  id: "job-1",
  type: GrowthJobType.FOUNDATION_NOOP,
  status: GrowthJobStatus.CLAIMED,
  payload: {},
  idempotencyKey: "foundation:test",
  runAfter: new Date(),
  attemptCount: 1,
  maxAttempts: 3,
  workerId: "test-worker",
  claimedAt: new Date(),
  leaseUntil: new Date(Date.now() + 60_000),
  heartbeatAt: new Date(),
  lastError: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  completedAt: null,
};

describe("bounded Growth worker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getGrowthSettings.mockResolvedValue(settings);
    mocks.promoteDueGrowthRetries.mockResolvedValue({ count: 0 });
    mocks.recoverStaleGrowthJobs.mockResolvedValue(0);
    mocks.heartbeatUpsert.mockResolvedValue({});
    mocks.heartbeatUpdateMany.mockResolvedValue({ count: 1 });
    mocks.markGrowthJobRunning.mockResolvedValue(undefined);
    mocks.completeGrowthJob.mockResolvedValue(undefined);
    mocks.failGrowthJob.mockResolvedValue(GrowthJobStatus.FAILED_RETRYABLE);
    mocks.dispatchGrowthJob.mockResolvedValue({ handled: true });
  });

  it("exits without claiming when Growth is disabled", async () => {
    mocks.getGrowthSettings.mockResolvedValue({ ...settings, enabled: false });
    await expect(runGrowthWorker()).resolves.toEqual({ status: "DISABLED", claimed: 0, succeeded: 0, failed: 0 });
    expect(mocks.claimGrowthJobs).not.toHaveBeenCalled();
    expect(mocks.heartbeatUpsert).not.toHaveBeenCalled();
  });

  it("exits cleanly when the queue is empty", async () => {
    mocks.claimGrowthJobs.mockResolvedValue([]);
    await expect(runGrowthWorker({ workerId: "test-worker" })).resolves.toEqual({ status: "EMPTY", claimed: 0, succeeded: 0, failed: 0 });
    expect(mocks.claimGrowthJobs).toHaveBeenCalledTimes(1);
  });

  it("executes a claimed job exactly once and stops at the empty queue", async () => {
    mocks.claimGrowthJobs.mockResolvedValueOnce([job]);
    const result = await runGrowthWorker({ workerId: "test-worker", batchSize: 3 });
    expect(result).toEqual({ status: "COMPLETED", claimed: 1, succeeded: 1, failed: 0 });
    expect(mocks.claimGrowthJobs).toHaveBeenCalledWith({ workerId: expect.stringMatching(/^test-worker:[0-9a-f-]{36}$/), limit: 3 });
    expect(mocks.heartbeatUpsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ invocationId: expect.stringMatching(/^[0-9a-f-]{36}$/) }),
      update: expect.objectContaining({ invocationId: expect.stringMatching(/^[0-9a-f-]{36}$/) }),
    }));
    expect(mocks.heartbeatUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { workerId: "test-worker", invocationId: expect.stringMatching(/^[0-9a-f-]{36}$/) },
    }));
    expect(mocks.dispatchGrowthJob).toHaveBeenCalledTimes(1);
    expect(mocks.completeGrowthJob).toHaveBeenCalledTimes(1);
  });

  it("checks the kill switch after claim and releases work without execution", async () => {
    mocks.getGrowthSettings.mockResolvedValueOnce(settings).mockResolvedValueOnce({ ...settings, enabled: false });
    mocks.claimGrowthJobs.mockResolvedValueOnce([job]);
    const result = await runGrowthWorker({ workerId: "test-worker" });
    expect(result.claimed).toBe(1);
    expect(mocks.releaseClaimedGrowthJob).toHaveBeenCalledWith(job, expect.stringMatching(/^test-worker:/), expect.any(String));
    expect(mocks.dispatchGrowthJob).not.toHaveBeenCalled();
  });

  it("persists handler failure instead of retrying in-process", async () => {
    mocks.claimGrowthJobs.mockResolvedValueOnce([job]);
    mocks.dispatchGrowthJob.mockRejectedValueOnce(new Error("expected failure"));
    const result = await runGrowthWorker({ workerId: "test-worker" });
    expect(result.failed).toBe(1);
    expect(mocks.failGrowthJob).toHaveBeenCalledTimes(1);
    expect(mocks.dispatchGrowthJob).toHaveBeenCalledTimes(1);
  });
});
