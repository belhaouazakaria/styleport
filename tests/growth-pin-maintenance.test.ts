import { beforeEach, describe, expect, it, vi } from "vitest";
import { GrowthJobType } from "@prisma/client";

const m = vi.hoisted(() => ({
  settings: vi.fn(), blocking: vi.fn(), accounts: vi.fn(),
  state: vi.fn(), pins: vi.fn(), activityCount: vi.fn(),
  transaction: vi.fn(), lock: vi.fn(), audit: vi.fn(),
  inventory: vi.fn(), metrics: vi.fn(),
}));
vi.mock("@/lib/growth/activity", () => ({ recordGrowthActivity: m.audit }));
vi.mock("@/lib/growth/operations/approved-publication-queue", () => ({
  countBlockingGrowthJobs: m.blocking,
}));
vi.mock("@/lib/growth/pinterest/analytics", () => ({
  syncPinterestPinInventory: m.inventory,
  syncPinterestPinAnalytics: m.metrics,
}));
vi.mock("@/lib/prisma", () => ({ prisma: {
  $transaction: m.transaction, $disconnect: vi.fn(),
  growthSettings: { findUnique: m.settings },
} }));
import { assertPinMaintenanceRuntime, chooseMaintenanceKind,
  runBoundedPinMaintenance } from "@/workers/growth-pin-maintenance";

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

describe("bounded Pinterest Pin maintenance runtime", () => {
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
  it("requires exact owner approval, release SHA, identity, UTC window and DB", () => {
    expect(assertPinMaintenanceRuntime(env, sha, identity, now)).toEqual({
      sha, day: "2026-11-12", hour: 10,
    });
    expect(() => assertPinMaintenanceRuntime(env, "b".repeat(40), identity, now)).toThrow();
    expect(() => assertPinMaintenanceRuntime({ ...env,
      GROWTH_PIN_MAINTENANCE_APPROVAL: "wrong",
    }, sha, identity, now)).toThrow();
    expect(() => assertPinMaintenanceRuntime(env, sha, { ...identity, uid: 0 }, now)).toThrow();
    expect(() => assertPinMaintenanceRuntime(env, sha, identity, new Date("2026-11-12T10:44:59Z"))).toThrow();
    expect(() => assertPinMaintenanceRuntime(env, sha, identity, new Date("2026-11-12T11:45:01Z"))).toThrow();
    expect(() => assertPinMaintenanceRuntime({ ...env,
      DATABASE_URL: "postgresql://private:secret@localhost:5433/saytwist",
    }, sha, identity, now)).toThrow();
  });
  it("rejects inherited web worker/AI/attribution/Telegram flags", () => {
    for (const flag of ["GROWTH_WORKER_RUN_ENABLED", "GROWTH_DAILY_REPORT_SCHEDULE_ENABLED",
      "TELEGRAM_REPORTS_ENABLED", "GROWTH_ATTRIBUTION_COLLECTION_ENABLED",
      "GROWTH_AI_IMAGE_ENABLED", "GROWTH_DAILY_ANALYTICS_SCOPE"]) {
      expect(() => assertPinMaintenanceRuntime({ ...env, [flag]: "true" },
        sha, identity, now)).toThrow();
    }
  });
  it("resumes incomplete inventory before Pin metrics, including no-eligible case", () => {
    expect(chooseMaintenanceKind(state(), 226, now)).toBe(GrowthJobType.PINTEREST_PIN_ANALYTICS_SYNC);
    expect(chooseMaintenanceKind(state(), 0, now)).toBeNull();
    expect(chooseMaintenanceKind({ ...state(),
      lastInventorySyncAt: new Date("2026-11-10T08:00:00Z"),
    }, 226, now)).toBe(GrowthJobType.PINTEREST_PIN_INVENTORY_SYNC);
    expect(chooseMaintenanceKind({ ...state(),
      inventoryBookmark: "opaque",
    }, 226, now)).toBe(GrowthJobType.PINTEREST_PIN_INVENTORY_SYNC);
  });
});

describe("crash-safe, queue-free maintenance tick", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    m.blocking.mockResolvedValue(0);
    m.settings.mockResolvedValue({
      enabled: false, attributionEnabled: false, workerActivationExpiresAt: null,
    });
    m.accounts.mockResolvedValue([account()]);
    m.state.mockResolvedValue(state());
    m.pins.mockResolvedValue(226);
    m.activityCount.mockResolvedValue(0);
    m.audit.mockResolvedValue({});
    m.inventory.mockResolvedValue({ complete: true, pages: 1, pins: 237 });
    m.metrics.mockResolvedValue({ processed: 1, remaining: 225, complete: false });
    m.transaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb({
      $queryRaw: m.lock,
      growthSettings: { findUnique: m.settings },
      growthPinterestAccount: { findMany: m.accounts },
      growthPinterestAnalyticsState: { findUnique: m.state },
      growthPinterestPin: { count: m.pins },
      growthActivity: { count: m.activityCount },
    }));
  });
  it("commits one immutable request reservation before reading one Pin", async () => {
    await expect(runBoundedPinMaintenance(now)).resolves.toEqual({
      status: "PIN_SUCCEEDED", growth: "OFF", providerGetsMax: 1,
    });
    expect(m.metrics).toHaveBeenCalledOnce();
    expect(m.metrics).toHaveBeenCalledWith(expect.objectContaining({
      accountId: "account123", maintenanceBounded: true, batch: 0, relevancePrepared: true,
    }));
    expect(m.inventory).not.toHaveBeenCalled();
    expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({
      action: "PIN_MAINTENANCE_SLOT_RESERVED",
      correlationKey: "growth-pin-maintenance-v1:2026-11-12:10",
    }), expect.anything());
    expect(m.audit.mock.invocationCallOrder[0]).toBeLessThan(
      m.metrics.mock.invocationCallOrder[0]);
  });
  it("resumes inventory with one page and no queued continuation", async () => {
    m.state.mockResolvedValue({ ...state(), inventoryBookmark: "opaque" });
    await expect(runBoundedPinMaintenance(now)).resolves.toMatchObject({
      status: "INVENTORY_SUCCEEDED", providerGetsMax: 1,
    });
    expect(m.inventory).toHaveBeenCalledOnce();
    expect(m.inventory).toHaveBeenCalledWith(expect.objectContaining({
      accountId: "account123", maintenanceBounded: true,
    }));
    expect(m.metrics).not.toHaveBeenCalled();
  });
  it("skips busy queue, previously reserved slots and insufficient quota headroom", async () => {
    m.blocking.mockResolvedValueOnce(1);
    await expect(runBoundedPinMaintenance(now)).resolves.toMatchObject({
      status: "SKIPPED_BUSY", providerGetsMax: 0,
    });
    m.activityCount.mockResolvedValueOnce(1);
    await expect(runBoundedPinMaintenance(now)).resolves.toMatchObject({
      status: "ALREADY_ATTEMPTED", providerGetsMax: 0,
    });
    m.activityCount.mockResolvedValueOnce(0).mockResolvedValueOnce(2).mockResolvedValueOnce(0);
    await expect(runBoundedPinMaintenance(now)).resolves.toMatchObject({
      status: "SKIPPED_BUDGET", providerGetsMax: 0,
    });
    expect(m.inventory).not.toHaveBeenCalled();
    expect(m.metrics).not.toHaveBeenCalled();
    expect(m.audit).not.toHaveBeenCalled();
  });
  it("does not repeat an ambiguous failed request in the same time slot", async () => {
    m.metrics.mockRejectedValue(Error("provider unavailable"));
    await expect(runBoundedPinMaintenance(now)).rejects.toThrow("provider unavailable");
    expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({
      action: "PIN_MAINTENANCE_SLOT_RESERVED",
    }), expect.anything());
    expect(m.metrics).toHaveBeenCalledOnce();
    expect(m.audit).toHaveBeenCalledTimes(1);
  });
});
