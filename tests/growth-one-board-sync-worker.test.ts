import { beforeEach, describe, expect, it, vi } from "vitest";
import { GrowthJobStatus, GrowthJobType } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  lock: vi.fn(),
  settings: vi.fn(),
  viral: vi.fn(),
  jobs: vi.fn(),
  account: vi.fn(),
  postAccount: vi.fn(),
  boardCount: vi.fn(),
  budgetCount: vi.fn(),
  updateLease: vi.fn(),
  activity: vi.fn(),
  worker: vi.fn(),
  revoke: vi.fn(),
  jobRead: vi.fn(),
}));

vi.mock("@/lib/growth/activity", () => ({ recordGrowthActivity: mocks.activity }));
vi.mock("@/lib/growth/settings", () => ({ revokeGrowthWorkerActivation: mocks.revoke }));
vi.mock("@/lib/growth/worker", () => ({ runGrowthWorker: mocks.worker }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
    growthSettings: { findUnique: mocks.settings },
    growthJob: { findUnique: mocks.jobRead },
    growthPinterestAccount: { findUnique: mocks.postAccount },
    growthPinterestBoard: { count: mocks.boardCount },
  },
}));

import { runOneBoardSync } from "@/workers/growth-one-board-sync";

const sha = "b".repeat(40);
const accountId = "account1234567890";
const runAfter = new Date("2026-11-09T22:47:42.733Z");
const minute = Math.floor(runAfter.getTime() / 60_000);
const job = (kind: "account" | "board") => ({
  id: kind + "-job",
  type: kind === "account"
    ? GrowthJobType.PINTEREST_ACCOUNT_SYNC
    : GrowthJobType.PINTEREST_BOARD_SYNC,
  status: GrowthJobStatus.PENDING,
  idempotencyKey: "pinterest:" + kind + "-sync:" + accountId + ":" + minute,
  payload: { accountId }, runAfter, attemptCount: 0, maxAttempts: 3,
  workerId: null, claimedAt: null, leaseUntil: null,
  heartbeatAt: null, lastError: null, completedAt: null,
});

describe("A single existing owner-queued board job with a scoped lease", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    const queue = [job("board"), job("account")];
    mocks.lock.mockResolvedValue([{ id: "global" }]);
    mocks.settings.mockResolvedValue({
      enabled: false, attributionEnabled: false, workerActivationExpiresAt: null,
    });
    mocks.viral.mockResolvedValue({ mode: "REVIEW" });
    mocks.jobs.mockResolvedValue(queue);
    mocks.account.mockResolvedValue({
      id: accountId, apiEnvironment: "PRODUCTION", connectionStatus: "CONNECTED",
      encryptedCredentials: "opaque",
      grantedScopes: ["boards:read", "user_accounts:read"],
      accessTokenExpiresAt: new Date(Date.now() + 60 * 60_000),
      refreshTokenExpiresAt: new Date(Date.now() + 2 * 60 * 60_000),
    });
    mocks.postAccount.mockResolvedValue({
      lastBoardSyncAt: new Date(Date.now() + 60_000), connectionStatus: "CONNECTED",
    });
    mocks.boardCount.mockResolvedValue(18);
    mocks.budgetCount.mockResolvedValue(0);
    mocks.updateLease.mockResolvedValue({ count: 1 });
    mocks.activity.mockResolvedValue({});
    mocks.worker.mockResolvedValue({
      status: "COMPLETED", claimed: 1, succeeded: 1, failed: 0,
    });
    mocks.revoke.mockResolvedValue(1);
    mocks.jobRead.mockImplementation(async ({ where }: { where: { id: string } }) => {
      if (where.id === "board-job") return {
        type: GrowthJobType.PINTEREST_BOARD_SYNC,
        status: GrowthJobStatus.SUCCEEDED, attemptCount: 1,
      };
      return {
        type: GrowthJobType.PINTEREST_ACCOUNT_SYNC,
        status: GrowthJobStatus.PENDING, attemptCount: 0, workerId: null,
      };
    });
    mocks.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn({
      $queryRaw: mocks.lock,
      growthSettings: {
        findUnique: mocks.settings, updateMany: mocks.updateLease,
      },
      growthViralProgramSettings: { findUnique: mocks.viral },
      growthJob: { findMany: mocks.jobs },
      growthPinterestAccount: { findUnique: mocks.account },
      growthPinterestBoard: { count: mocks.boardCount },
      growthActivity: { count: mocks.budgetCount },
    }));
  });

  it("processes only queued BOARD_SYNC, preserves ACCOUNT_SYNC and revokes exact lease", async () => {
    const result = await runOneBoardSync(sha);
    expect(result).toMatchObject({
      job: "SUCCEEDED", growth: "OFF", lease: "NONE",
      accountSync: "PENDING", activeBoards: 18,
      providerGets: 1, providerWrites: 0, aiCalls: 0, pinsPublished: 0,
    });
    expect(mocks.worker).toHaveBeenCalledWith(expect.objectContaining({
      onlyJobId: "board-job", batchSize: 1,
      rolloutConfig: { GROWTH_WORKER_RUN_ENABLED: "true",
        GROWTH_ROLLOUT_MODE: "OBSERVE" },
    }));
    expect(mocks.updateLease).toHaveBeenCalledOnce();
    expect(mocks.activity).toHaveBeenCalledWith(expect.objectContaining({
      action: "WORKER_ACTIVATION_ONE_PINTEREST_BOARD_SYNC",
      correlationKey: "one-board-sync:board-job",
    }), expect.anything());
    expect(mocks.revoke).toHaveBeenCalledOnce();
    expect(process.env.GROWTH_PINTEREST_BOARD_SYNC_JOB_ID).toBeUndefined();
  });

  it("rejects unrelated queued work before toggling any Growth setting", async () => {
    mocks.jobs.mockResolvedValue([job("board"), job("account"), {
      ...job("board"), id: "third-job", type: GrowthJobType.PINTEREST_PIN_PUBLISH,
    }]);
    await expect(runOneBoardSync(sha)).rejects.toThrow("BOARD_SYNC_ADMISSION_NOT_IDLE");
    expect(mocks.updateLease).not.toHaveBeenCalled();
    expect(mocks.worker).not.toHaveBeenCalled();
  });

  it("rejects a claimed job, modified attempts or missing REVIEW mode", async () => {
    for (const boardOverride of [
      { workerId: "worker" },
      { attemptCount: 1 },
      { maxAttempts: 4 },
      { runAfter: new Date("2026-11-10T00:00:00Z") },
      { payload: { accountId: "unrelated" } },
    ]) {
      mocks.jobs.mockResolvedValue([{ ...job("board"), ...boardOverride }, job("account")]);
      await expect(runOneBoardSync(sha)).rejects.toThrow();
      expect(mocks.updateLease).not.toHaveBeenCalled();
    }
    mocks.jobs.mockResolvedValue([job("board"), job("account")]);
    mocks.viral.mockResolvedValue({ mode: "PAUSED" });
    await expect(runOneBoardSync(sha)).rejects.toThrow();
    expect(mocks.worker).not.toHaveBeenCalled();
  });

  it("rejects insufficient board scope, stale token and provider cooldown", async () => {
    mocks.account.mockResolvedValueOnce({
      id: accountId, apiEnvironment: "PRODUCTION",
      connectionStatus: "CONNECTED",
      encryptedCredentials: "opaque", grantedScopes: [],
      accessTokenExpiresAt: new Date(Date.now() + 60 * 60_000),
      refreshTokenExpiresAt: new Date(Date.now() + 2 * 60 * 60_000),
    });
    await expect(runOneBoardSync(sha)).rejects.toThrow("PINTEREST_BOARD_ACCOUNT_NOT_READY");
    mocks.budgetCount.mockResolvedValue(1);
    await expect(runOneBoardSync(sha)).rejects.toThrow("PINTEREST_BOARD_PROVIDER_BUDGET_NOT_READY");
    expect(mocks.updateLease).not.toHaveBeenCalled();
  });

  it("always releases its scoped lease after an unexpected worker failure", async () => {
    mocks.worker.mockRejectedValue(Error("network failure"));
    await expect(runOneBoardSync(sha)).rejects.toThrow("network failure");
    expect(mocks.revoke).toHaveBeenCalledOnce();
    expect(process.env.GROWTH_PINTEREST_BOARD_SYNC_JOB_ID).toBeUndefined();
  });
});
