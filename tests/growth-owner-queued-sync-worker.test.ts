import { beforeEach, describe, expect, it, vi } from "vitest";
import { GrowthJobStatus, GrowthJobType } from "@prisma/client";

const m = vi.hoisted(() => ({
  transaction: vi.fn(), lock: vi.fn(), settings: vi.fn(),
  policy: vi.fn(), findJobs: vi.fn(), boardDone: vi.fn(),
  account: vi.fn(), activityCount: vi.fn(), updateLease: vi.fn(),
  activity: vi.fn(), reserve: vi.fn(), worker: vi.fn(),
  revoke: vi.fn(), jobAfter: vi.fn(), activeCount: vi.fn(),
}));
vi.mock("@/lib/growth/activity", () => ({ recordGrowthActivity: m.activity }));
vi.mock("@/lib/growth/pinterest/one-sync-guard", () => ({
  reserveOneAccountSyncRequest: m.reserve,
}));
vi.mock("@/lib/growth/settings", () => ({
  revokeGrowthWorkerActivation: m.revoke,
}));
vi.mock("@/lib/growth/worker", () => ({ runGrowthWorker: m.worker }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: m.transaction,
    growthSettings: { findUnique: m.settings },
    growthJob: { findMany: m.findJobs,
      findUnique: m.jobAfter, count: m.activeCount },
  },
}));

import { completeOwnerQueuedPinterestSyncs } from "@/workers/growth-owner-queued-pinterest-sync";

const accountId = "account1234567890";
const runAfter = new Date("2026-11-09T22:47:42.733Z");
const minute = Math.floor(runAfter.getTime() / 60000);
const makeJob = (kind: "board" | "account") => ({
  id: kind + "-job",
  type: kind === "board" ? GrowthJobType.PINTEREST_BOARD_SYNC :
    GrowthJobType.PINTEREST_ACCOUNT_SYNC,
  status: GrowthJobStatus.PENDING,
  idempotencyKey: "pinterest:" + kind + "-sync:" + accountId + ":" + minute,
  payload: { accountId }, runAfter, attemptCount: 0, maxAttempts: 3,
  workerId: null, claimedAt: null, leaseUntil: null,
  heartbeatAt: null, completedAt: null, lastError: null,
});
let remaining = [makeJob("board"), makeJob("account")];

describe("complete original queued Pinterest syncs via existing exact-ID worker", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    remaining = [makeJob("board"), makeJob("account")];
    m.lock.mockResolvedValue([{ id: "global" }]);
    m.settings.mockResolvedValue({
      enabled: false, attributionEnabled: false, workerActivationExpiresAt: null,
    });
    m.policy.mockResolvedValue({
      mode: "ACTIVE", sourceSharePercent: 50, maxPinsPerDay: 5,
    });
    m.findJobs.mockImplementation(async () => [...remaining]);
    m.boardDone.mockResolvedValue({ id: "board-job" });
    m.account.mockResolvedValue({
      id: accountId, apiEnvironment: "PRODUCTION",
      connectionStatus: "CONNECTED", encryptedCredentials: "opaque",
      grantedScopes: ["boards:read", "user_accounts:read"],
      accessTokenExpiresAt: new Date(Date.now() + 3_600_000),
      refreshTokenExpiresAt: new Date(Date.now() + 7_200_000),
      boards: [{ id: "board-id" }],
    });
    m.activityCount.mockResolvedValue(0);
    m.updateLease.mockResolvedValue({ count: 1 });
    m.activity.mockResolvedValue({});
    m.reserve.mockResolvedValue(undefined);
    m.revoke.mockResolvedValue(1);
    m.jobAfter.mockResolvedValue({
      status: GrowthJobStatus.SUCCEEDED, attemptCount: 1,
    });
    m.activeCount.mockImplementation(async () => remaining.length);
    m.worker.mockImplementation(async ({ onlyJobId }: { onlyJobId: string }) => {
      const scoped = process.env.GROWTH_PINTEREST_BOARD_SYNC_JOB_ID ||
        process.env.GROWTH_PINTEREST_ONE_SYNC_JOB_ID;
      if (scoped !== onlyJobId) throw Error("UNSCOPED_TEST");
      remaining = remaining.filter(job => job.id !== onlyJobId);
      return { status: "COMPLETED", claimed: 1, succeeded: 1, failed: 0 };
    });
    m.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn({
      $queryRaw: m.lock,
      growthSettings: {
        findUnique: m.settings, updateMany: m.updateLease,
      },
      growthViralProgramSettings: { findUnique: m.policy },
      growthJob: { findMany: m.findJobs, findFirst: m.boardDone },
      growthPinterestAccount: { findUnique: m.account },
      growthActivity: { count: m.activityCount },
    }));
  });

  it("completes both ORIGINAL jobs, one GET scope each, no new jobs", async () => {
    const result = await completeOwnerQueuedPinterestSyncs();
    expect(result).toMatchObject({
      board: { stage: "BOARD", status: "SUCCEEDED" },
      account: { stage: "ACCOUNT", status: "SUCCEEDED" }, pending: 0,
    });
    expect(m.worker).toHaveBeenCalledTimes(2);
    expect(m.worker).toHaveBeenNthCalledWith(1, expect.objectContaining({
      onlyJobId: "board-job", batchSize: 1,
      rolloutConfig: { GROWTH_WORKER_RUN_ENABLED: "true",
        GROWTH_ROLLOUT_MODE: "OBSERVE" },
    }));
    expect(m.worker).toHaveBeenNthCalledWith(2, expect.objectContaining({
      onlyJobId: "account-job", batchSize: 1,
    }));
    expect(m.reserve).toHaveBeenCalledTimes(1);
    expect(m.updateLease).toHaveBeenCalledTimes(2);
    expect(m.revoke).toHaveBeenCalledTimes(2);
    expect(m.activity).toHaveBeenCalledTimes(2);
    expect(process.env.GROWTH_PINTEREST_BOARD_SYNC_JOB_ID).toBeUndefined();
    expect(process.env.GROWTH_PINTEREST_ONE_SYNC_JOB_ID).toBeUndefined();
  });

  it("resumes the existing account job only after the original board SUCCEEDED", async () => {
    remaining = [makeJob("account")];
    const result = await completeOwnerQueuedPinterestSyncs();
    expect(result).toMatchObject({
      board: null, account: { stage: "ACCOUNT", status: "SUCCEEDED" }, pending: 0,
    });
    expect(m.worker).toHaveBeenCalledTimes(1);
    expect(m.boardDone).toHaveBeenCalledOnce();
    expect(m.worker).toHaveBeenCalledWith(expect.objectContaining({
      onlyJobId: "account-job",
    }));
  });

  it("blocks unexpected queue jobs and preserves leases untouched", async () => {
    remaining = [makeJob("board"), makeJob("account"), makeJob("board")];
    await expect(completeOwnerQueuedPinterestSyncs()).rejects.toThrow(
      "OWNER_SYNC_QUEUE_CHANGED");
    expect(m.updateLease).not.toHaveBeenCalled();
    expect(m.worker).not.toHaveBeenCalled();
  });

  it("blocks missing provider quota/invalid viral mode without an API call", async () => {
    m.policy.mockResolvedValue({ mode: "REVIEW" });
    await expect(completeOwnerQueuedPinterestSyncs()).rejects.toThrow(
      "QUEUED_SYNC_GLOBAL_GATE_BLOCKED");
    expect(m.worker).not.toHaveBeenCalled();
    m.policy.mockResolvedValue({
      mode: "ACTIVE", sourceSharePercent: 50, maxPinsPerDay: 5,
    });
    m.activityCount.mockResolvedValue(15);
    await expect(completeOwnerQueuedPinterestSyncs()).rejects.toThrow(
      "QUEUED_SYNC_PROVIDER_BUDGET_BLOCKED");
    expect(m.worker).not.toHaveBeenCalled();
  });
});
