import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  rotation: vi.fn(),
  fresh: vi.fn(),
  sync: vi.fn(),
  capacity: vi.fn(),
  settings: vi.fn(),
  blocking: vi.fn(),
}));
vi.mock("@/lib/growth/portfolio/daily-rotation-store", () => ({
  readDailyRotation: m.rotation,
}));
vi.mock("@/lib/growth/pinterest/daily-observe-freshness", () => ({
  hasVerifiedRecentPinterestAccountSync: m.fresh,
}));
vi.mock("@/workers/growth-one-account-sync", () => ({
  runOneAccountSync: m.sync,
}));
vi.mock("@/lib/growth/pinterest/global-budget", () => ({
  hasPinterestMaintenanceCapacity: m.capacity,
}));
vi.mock("@/lib/growth/operations/approved-publication-queue", () => ({
  countBlockingGrowthJobs: m.blocking,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { growthSettings: { findUnique: m.settings } },
}));
import { executeDailyObservation } from "@/workers/growth-daily-observe";
const sha = "a".repeat(40),
  day = "2026-11-15",
  accountId = "cmwgfd44v000ya54wraf6ai89";
describe("V2 scheduled observer selects one portfolio account", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    m.rotation.mockResolvedValue({ accountId });
    m.fresh.mockResolvedValue(false);
    m.capacity.mockResolvedValue(true);
    m.sync.mockResolvedValue({
      job: "SUCCEEDED",
      providerGets: 1,
      growth: "OFF",
    });
    m.settings.mockResolvedValue({
      enabled: false,
      attributionEnabled: false,
      workerActivationExpiresAt: null,
    });
    m.blocking.mockResolvedValue(0);
  });
  it("passes the exact daily rotation to both evidence and one-read execution", async () => {
    const result = await executeDailyObservation(sha, day, "SCHEDULED", true);
    expect(result.status).toBe("PASSED");
    expect(m.rotation).toHaveBeenCalledWith(new Date(day + "T00:00:00Z"));
    expect(m.fresh).toHaveBeenCalledWith(expect.any(Date), accountId);
    expect(m.sync).toHaveBeenCalledWith(sha, {
      dailyUtcDate: day,
      selectedAccountId: accountId,
    });
  });
  it("uses actual completed evidence without another reservation or GET", async () => {
    m.fresh.mockResolvedValue(true);
    expect(
      (await executeDailyObservation(sha, day, "SCHEDULED", true)).status,
    ).toBe("ALREADY_FRESH");
    expect(m.sync).not.toHaveBeenCalled();
    expect(m.capacity).not.toHaveBeenCalled();
  });
  it("defers exhausted capacity before creating or claiming a job", async () => {
    m.capacity.mockResolvedValue(false);
    expect(
      await executeDailyObservation(sha, day, "SCHEDULED", true),
    ).toMatchObject({
      status: "QUOTA_PAUSED",
      result: { job: "NONE", providerGets: 0, growth: "OFF", lease: "NONE" },
    });
    expect(m.sync).not.toHaveBeenCalled();
  });
  it("never labels another active worker as OFF during quota deferral", async () => {
    m.capacity.mockResolvedValue(false);
    m.settings.mockResolvedValue({ enabled: true });
    await expect(
      executeDailyObservation(sha, day, "SCHEDULED", true),
    ).rejects.toThrow("DAILY_OBSERVE_NOT_IDLE");
    expect(m.sync).not.toHaveBeenCalled();
  });
  it("fails closed without an eligible rotation", async () => {
    m.rotation.mockResolvedValue({ accountId: null });
    await expect(
      executeDailyObservation(sha, day, "SCHEDULED", true),
    ).rejects.toThrow("DAILY_OBSERVE_NO_ELIGIBLE_ACCOUNT");
    expect(m.sync).not.toHaveBeenCalled();
  });
  it("keeps manual trials on the original strict single-account path", async () => {
    await executeDailyObservation(sha, day, "TRIAL", true);
    expect(m.rotation).not.toHaveBeenCalled();
    expect(m.fresh).not.toHaveBeenCalled();
    expect(m.capacity).not.toHaveBeenCalled();
    expect(m.sync).toHaveBeenCalledWith(sha, { dailyUtcDate: day });
  });
});
