import { beforeEach, describe, expect, it, vi } from "vitest";
import { GrowthJobStatus, GrowthJobType } from "@prisma/client";

const mock = vi.hoisted(() => {
  const state = {
    enabled: false, attributionEnabled: false,
    workerActivationExpiresAt: null as Date | null,
    activeQueue: 0, status: "PENDING", casCount: 1,
  };
  return {
    state,
    runWorker: vi.fn(),
    revoke: vi.fn(),
    audit: vi.fn(),
    transaction: vi.fn(),
    settingsRead: vi.fn(),
    jobCount: vi.fn(),
    updateMany: vi.fn(),
    create: vi.fn(),
    jobRead: vi.fn(),
  };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    growthSettings: { findUnique: mock.settingsRead },
    growthJob: { count: mock.jobCount, findUnique: mock.jobRead },
    $transaction: mock.transaction,
  },
}));
vi.mock("@/lib/growth/worker", () => ({ runGrowthWorker: mock.runWorker }));
vi.mock("@/lib/growth/settings", () => ({ revokeGrowthWorkerActivation: mock.revoke }));
vi.mock("@/lib/growth/activity", () => ({ recordGrowthActivity: mock.audit }));

import { assertRecommendTrialRuntime, runRecommendTrial } from "@/workers/growth-recommend-trial";

const sha = "a".repeat(40);
const approval = "RUN SAYTWIST GROWTH RECOMMEND ONE SHOT " + sha;
const env = {
  EXPECTED_RELEASE: sha,
  GROWTH_RECOMMEND_TRIAL_APPROVAL: approval,
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://test:test@127.0.0.1:5433/saytwist",
  GROWTH_WORKER_RUN_ENABLED: "false",
  GROWTH_ROLLOUT_MODE: "OFF",
};
const identity = {
  username: "saytwist", uid: 1001,
  cwd: "/home/saytwist/htdocs/saytwist.com",
  node: "/home/saytwist/.nvm/versions/node/v24.20.0/bin/node",
};

describe("Phase14H single RECOMMEND trial runtime gate", () => {
  it("requires exact deployed SHA, approval, production user and loopback DB", () => {
    expect(assertRecommendTrialRuntime(env, sha, identity)).toBe(sha);
    expect(() => assertRecommendTrialRuntime(env, "b".repeat(40), identity)).toThrow();
    expect(() => assertRecommendTrialRuntime({ ...env, GROWTH_RECOMMEND_TRIAL_APPROVAL: "" }, sha, identity)).toThrow();
    expect(() => assertRecommendTrialRuntime(env, sha, { ...identity, uid: 0 })).toThrow();
    expect(() => assertRecommendTrialRuntime({ ...env, DATABASE_URL: "postgresql://u:p@remote:5433/saytwist" }, sha, identity)).toThrow();
  });
  it("rejects any active automation flag or rollout mode", () => {
    for (const flag of [
      "GROWTH_WORKER_RUN_ENABLED", "GROWTH_DAILY_REPORT_SCHEDULE_ENABLED",
      "TELEGRAM_REPORTS_ENABLED", "GROWTH_ATTRIBUTION_COLLECTION_ENABLED",
    ]) expect(() => assertRecommendTrialRuntime({ ...env, [flag]: "true" }, sha, identity)).toThrow();
    expect(() => assertRecommendTrialRuntime({ ...env, GROWTH_ROLLOUT_MODE: "OBSERVE" }, sha, identity)).toThrow();
    expect(() => assertRecommendTrialRuntime({ ...env, GROWTH_ROLLOUT_MODE: "RECOMMEND" }, sha, identity)).toThrow();
  });
});

describe("Phase14H one-job lease admission and rollback", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    Object.assign(mock.state, {
      enabled: false, attributionEnabled: false, workerActivationExpiresAt: null,
      activeQueue: 0, status: "PENDING", casCount: 1,
    });
    mock.settingsRead.mockImplementation(async () => ({
      enabled: mock.state.enabled,
      attributionEnabled: mock.state.attributionEnabled,
      workerActivationExpiresAt: mock.state.workerActivationExpiresAt,
    }));
    mock.jobCount.mockImplementation(async () => mock.state.activeQueue);
    mock.updateMany.mockImplementation(async ({ data }: { data: { workerActivationExpiresAt: Date } }) => {
      if (mock.state.casCount !== 1) return { count: 0 };
      mock.state.enabled = true;
      mock.state.workerActivationExpiresAt = data.workerActivationExpiresAt;
      return { count: 1 };
    });
    mock.create.mockImplementation(async () => {
      mock.state.activeQueue = 1;
      return { id: "trial-id" };
    });
    mock.jobRead.mockImplementation(async () => ({
      type: GrowthJobType.ACCOUNT_STRATEGY_REVIEW, status: mock.state.status,
    }));
    mock.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        growthSettings: { findUnique: mock.settingsRead, updateMany: mock.updateMany },
        growthJob: { count: mock.jobCount, create: mock.create },
      };
      return callback(tx);
    });
    mock.revoke.mockImplementation(async () => {
      mock.state.enabled = false;
      mock.state.workerActivationExpiresAt = null;
      return 1;
    });
    mock.runWorker.mockImplementation(async () => {
      mock.state.status = "SUCCEEDED";
      mock.state.activeQueue = 0;
      return { status: "COMPLETED", claimed: 1, succeeded: 1, failed: 0 };
    });
    mock.audit.mockResolvedValue({});
  });

  it("executes exactly the specified local strategy job and closes the activation lease", async () => {
    await expect(runRecommendTrial(sha)).resolves.toEqual({
      job: "SUCCEEDED", growth: "OFF", lease: "NONE", activeQueue: 0,
    });
    expect(mock.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        type: GrowthJobType.ACCOUNT_STRATEGY_REVIEW,
        idempotencyKey: "growth-recommend-trial:" + sha,
        maxAttempts: 1,
        payload: expect.objectContaining({ modelVersion: "account_strategy_v1" }),
      }),
    }));
    expect(mock.runWorker).toHaveBeenCalledWith(expect.objectContaining({
      onlyJobId: "trial-id", batchSize: 1,
      rolloutConfig: { GROWTH_WORKER_RUN_ENABLED: "true", GROWTH_ROLLOUT_MODE: "RECOMMEND" },
    }));
    expect(mock.revoke).toHaveBeenCalledTimes(1);
    expect(mock.audit).toHaveBeenCalledTimes(2);
  });

  it("rejects pre-existing queued jobs without enabling Growth", async () => {
    mock.state.activeQueue = 1;
    await expect(runRecommendTrial(sha)).rejects.toThrow("PRECONDITION_FAILED");
    expect(mock.transaction).not.toHaveBeenCalled();
    expect(mock.runWorker).not.toHaveBeenCalled();
  });

  it("rejects race at admission before creating a job", async () => {
    mock.state.casCount = 0;
    await expect(runRecommendTrial(sha)).rejects.toThrow("ADMISSION_RACE");
    expect(mock.create).not.toHaveBeenCalled();
    expect(mock.runWorker).not.toHaveBeenCalled();
  });

  it("always attempts lease revocation if the worker throws", async () => {
    mock.runWorker.mockRejectedValue(Error("simulated worker failure"));
    await expect(runRecommendTrial(sha)).rejects.toThrow("simulated worker failure");
    expect(mock.revoke).toHaveBeenCalledTimes(1);
    expect(mock.state.enabled).toBe(false);
  });

  it("fails closed and revokes on partial, unexpected worker completion", async () => {
    mock.runWorker.mockResolvedValue({ status: "EMPTY", claimed: 0, succeeded: 0, failed: 0 });
    await expect(runRecommendTrial(sha)).rejects.toThrow("WORKER_UNEXPECTED");
    expect(mock.revoke).toHaveBeenCalledTimes(1);
  });
});
