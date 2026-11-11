import { beforeEach, describe, expect, it, vi } from "vitest";
import { GrowthJobStatus, GrowthJobType } from "@prisma/client";

const m = vi.hoisted(() => ({
  settings: vi.fn(), updateSettings: vi.fn(), blocking: vi.fn(),
  accounts: vi.fn(), analyticsState: vi.fn(), eligiblePins: vi.fn(),
  history: vi.fn(), providerCount: vi.fn(), createJob: vi.fn(),
  getJob: vi.fn(), lock: vi.fn(), transaction: vi.fn(), audit: vi.fn(),
  revoke: vi.fn(), worker: vi.fn(),
}));
vi.mock("@/lib/growth/activity", () => ({ recordGrowthActivity: m.audit }));
vi.mock("@/lib/growth/operations/approved-publication-queue", () => ({
  countBlockingGrowthJobs: m.blocking,
}));
vi.mock("@/lib/growth/settings", () => ({
  revokeGrowthWorkerActivation: m.revoke,
}));
vi.mock("@/lib/growth/worker", () => ({ runGrowthWorker: m.worker }));
vi.mock("@/lib/prisma", () => ({ prisma: {
  $transaction: m.transaction, $disconnect: vi.fn(),
  growthSettings: { findUnique: m.settings },
  growthJob: { findUnique: m.getJob },
} }));

import { assertPinMaintenanceRuntime, chooseMaintenanceKind,
  runBoundedPinMaintenance } from "@/workers/growth-pin-maintenance";
import { resolveGrowthRollout } from "@/lib/growth/rollout";

const sha = "a".repeat(40);
const now = new Date("2026-11-12T10:45:01.000Z");
const state = () => ({
  inventoryStartedAt: null, inventoryBookmark: null,
  lastInventorySyncAt: new Date("2026-11-12T08:00:00.000Z"),
});
const account = () => ({
  id: "account123", encryptedCredentials: "opaque",
  grantedScopes: ["user_accounts:read", "pins:read"],
  accessTokenExpiresAt: new Date("2026-12-11T12:55:06.900Z"),
  refreshTokenExpiresAt: new Date("2027-01-12T00:00:00.000Z"),
});

describe("one-GET Pinterest Pin maintenance runtime", () => {
  const identity = {
    username: "saytwist", uid: 1001,
    cwd: "/home/saytwist/htdocs/saytwist.com",
    node: "/home/saytwist/.nvm/versions/node/v24.20.0/bin/node",
  };
  const env = {
    EXPECTED_RELEASE: sha, NODE_ENV: "production",
    GROWTH_PIN_MAINTENANCE_ENTRYPOINT: "true",
    GROWTH_PIN_MAINTENANCE_ENABLED: "true",
    GROWTH_PIN_MAINTENANCE_APPROVAL: "SAYTWIST_PIN_MAINTENANCE:" + sha,
    GROWTH_PIN_MAINTENANCE_DAY: "2026-11-12",
    GROWTH_WORKER_RUN_ENABLED: "false",
    GROWTH_DAILY_REPORT_SCHEDULE_ENABLED: "false",
    TELEGRAM_REPORTS_ENABLED: "false",
    GROWTH_ATTRIBUTION_COLLECTION_ENABLED: "false",
    GROWTH_AI_IMAGE_ENABLED: "false",
    GROWTH_DAILY_ANALYTICS_SCOPE: "false",
    GROWTH_ROLLOUT_MODE: "OFF",
    GROWTH_PIN_MAINTENANCE_SCOPE: "false",
    PINTEREST_API_ENVIRONMENT: "production",
    APP_BASE_URL: "https://saytwist.com",
    DATABASE_URL: "postgresql://private:secret@127.0.0.1:5433/saytwist",
  };
  it("only allows exact release, owner approval, runtime identity, UTC slot and DB", () => {
    expect(assertPinMaintenanceRuntime(env, sha, identity, now)).toEqual({
      sha, day: "2026-11-12", hour: 10,
    });
    expect(() => assertPinMaintenanceRuntime(env, "b".repeat(40), identity, now)).toThrow();
    expect(() => assertPinMaintenanceRuntime({ ...env,
      GROWTH_PIN_MAINTENANCE_APPROVAL: "wrong",
    }, sha, identity, now)).toThrow();
    expect(() => assertPinMaintenanceRuntime(env, sha, { ...identity, uid: 0 }, now)).toThrow();
    expect(() => assertPinMaintenanceRuntime(env, sha, identity,
      new Date("2026-11-12T10:44:59Z"))).toThrow();
    expect(() => assertPinMaintenanceRuntime(env, sha, identity,
      new Date("2026-11-12T11:45:01Z"))).toThrow();
    expect(() => assertPinMaintenanceRuntime({ ...env,
      DATABASE_URL: "postgresql://private:secret@localhost:5433/saytwist",
    }, sha, identity, now)).toThrow();
  });
  it("never inherits broad web worker, AI, attribution, Telegram or other maintenance scope", () => {
    for (const flag of ["GROWTH_WORKER_RUN_ENABLED", "GROWTH_DAILY_REPORT_SCHEDULE_ENABLED",
      "TELEGRAM_REPORTS_ENABLED", "GROWTH_ATTRIBUTION_COLLECTION_ENABLED",
      "GROWTH_AI_IMAGE_ENABLED", "GROWTH_DAILY_ANALYTICS_SCOPE"]) {
      expect(() => assertPinMaintenanceRuntime({
        ...env, [flag]: "true",
      }, sha, identity, now)).toThrow();
    }
    expect(resolveGrowthRollout({
      GROWTH_WORKER_RUN_ENABLED: "true", GROWTH_ROLLOUT_MODE: "ANALYTICS",
      GROWTH_PIN_MAINTENANCE_SCOPE: "true", GROWTH_DAILY_ANALYTICS_SCOPE: "false",
    }).allowedTypes).toEqual([
      GrowthJobType.PINTEREST_PIN_INVENTORY_SYNC,
      GrowthJobType.PINTEREST_PIN_ANALYTICS_SYNC,
    ]);
    expect(resolveGrowthRollout({
      GROWTH_WORKER_RUN_ENABLED: "true", GROWTH_ROLLOUT_MODE: "ANALYTICS",
      GROWTH_PIN_MAINTENANCE_SCOPE: "false", GROWTH_DAILY_ANALYTICS_SCOPE: "false",
    }).allowedTypes).toEqual([]);
  });
  it("resumes incomplete or stale inventory, otherwise rotates Pin metrics", () => {
    expect(chooseMaintenanceKind(state(), 226, now)).toBe(
      GrowthJobType.PINTEREST_PIN_ANALYTICS_SYNC);
    expect(chooseMaintenanceKind(state(), 0, now)).toBeNull();
    expect(chooseMaintenanceKind({
      ...state(), lastInventorySyncAt: new Date("2026-11-10T08:00:00Z"),
    }, 226, now)).toBe(GrowthJobType.PINTEREST_PIN_INVENTORY_SYNC);
    expect(chooseMaintenanceKind({
      ...state(), inventoryBookmark: "opaque",
    }, 226, now)).toBe(GrowthJobType.PINTEREST_PIN_INVENTORY_SYNC);
  });
});

describe("one exact job without stranded queue entries", () => {
  let active = false;
  let type = GrowthJobType.PINTEREST_PIN_ANALYTICS_SYNC;
  beforeEach(() => {
    vi.resetAllMocks();
    active = false;
    type = GrowthJobType.PINTEREST_PIN_ANALYTICS_SYNC;
    m.blocking.mockResolvedValue(0);
    m.settings.mockImplementation(async () => ({
      enabled: active, attributionEnabled: false, workerActivationExpiresAt: null,
    }));
    m.accounts.mockResolvedValue([account()]);
    m.analyticsState.mockResolvedValue(state());
    m.eligiblePins.mockResolvedValue(226);
    m.history.mockResolvedValue(null);
    m.providerCount.mockResolvedValue(0);
    m.updateSettings.mockImplementation(async () => { active = true; return { count: 1 }; });
    m.createJob.mockImplementation(async ({ data }: { data: { type: GrowthJobType } }) => {
      type = data.type;
      return { id: "maint123" };
    });
    m.transaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb({
      $queryRaw: m.lock,
      growthSettings: { findUnique: m.settings, updateMany: m.updateSettings },
      growthPinterestAccount: { findMany: m.accounts },
      growthPinterestAnalyticsState: { findUnique: m.analyticsState },
      growthPinterestPin: { count: m.eligiblePins },
      growthJob: { findUnique: m.history, create: m.createJob },
      growthActivity: { count: m.providerCount },
    }));
    m.audit.mockResolvedValue({});
    m.worker.mockResolvedValue({ status: "COMPLETED", claimed: 1, succeeded: 1, failed: 0 });
    m.revoke.mockImplementation(async () => { active = false; return 1; });
    m.getJob.mockImplementation(async () => ({ status: GrowthJobStatus.SUCCEEDED, type }));
  });
  it("runs one exact pending Pin job with no generic queue sweep", async () => {
    await expect(runBoundedPinMaintenance(now)).resolves.toEqual({
      status: "PIN_SUCCEEDED", growth: "OFF", providerGetsMax: 1,
    });
    expect(m.createJob).toHaveBeenCalledOnce();
    expect(m.createJob).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        type: GrowthJobType.PINTEREST_PIN_ANALYTICS_SYNC,
        idempotencyKey: "growth-pin-maintenance-v1:2026-11-12:10",
        maxAttempts: 1,
      }),
    }));
    expect(m.worker).toHaveBeenCalledWith(expect.objectContaining({
      onlyJobId: "maint123", batchSize: 1,
      rolloutConfig: expect.objectContaining({
        GROWTH_PIN_MAINTENANCE_SCOPE: "true",
      }),
    }));
    expect(m.revoke).toHaveBeenCalled();
    expect(process.env.GROWTH_PIN_MAINTENANCE_JOB_ID).toBeUndefined();
  });
  it("does not create jobs when busy, already attempted or over provider headroom", async () => {
    m.blocking.mockResolvedValueOnce(1);
    await expect(runBoundedPinMaintenance(now)).resolves.toMatchObject({
      status: "SKIPPED_BUSY", providerGetsMax: 0,
    });
    m.history.mockResolvedValue({ id: "existing" });
    await expect(runBoundedPinMaintenance(now)).resolves.toMatchObject({
      status: "ALREADY_ATTEMPTED", providerGetsMax: 0,
    });
    m.history.mockResolvedValue(null);
    m.providerCount.mockResolvedValueOnce(2).mockResolvedValueOnce(0);
    await expect(runBoundedPinMaintenance(now)).resolves.toMatchObject({
      status: "SKIPPED_BUDGET", providerGetsMax: 0,
    });
    expect(m.createJob).not.toHaveBeenCalled();
    expect(m.worker).not.toHaveBeenCalled();
  });
  it("releases lease after a job failure without ever retrying", async () => {
    m.worker.mockResolvedValue({ status: "COMPLETED", claimed: 1, succeeded: 0, failed: 1 });
    await expect(runBoundedPinMaintenance(now)).rejects.toThrow("PIN_MAINTENANCE_JOB_FAILED");
    expect(m.revoke).toHaveBeenCalled();
    expect(active).toBe(false);
    expect(process.env.GROWTH_PIN_MAINTENANCE_JOB_ID).toBeUndefined();
  });
});
