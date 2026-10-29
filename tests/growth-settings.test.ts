import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  upsert: vi.fn(),
  transaction: vi.fn(),
  activity: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    growthSettings: { findUnique: mocks.findUnique },
    $transaction: mocks.transaction,
  },
}));
vi.mock("@/lib/growth/activity", () => ({ recordGrowthActivity: mocks.activity }));

import { getGrowthSettings, revokeGrowthWorkerActivation, updateGrowthSettings } from "@/lib/growth/settings";

describe("Growth settings persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("defaults to disabled without writing a row", async () => {
    mocks.findUnique.mockResolvedValueOnce(null);
    const settings = await getGrowthSettings();
    expect(settings).toMatchObject({
      enabled: false,
      workerActivationExpiresAt: null,
      intensity: "BALANCED",
      workerBatchSize: 5,
      ownedDomains: ["saytwist.com", "www.saytwist.com", "translator.whattypeof.com"],
      configVersion: 1,
      aiDailyBudgetCents: 200,
      aiMonthlyBudgetCents: 3000,
      aiImagesPerDayCap: 3,
      translatorCreatesPerDayCap: 1,
      translatorUpdatesPerDayCap: 3,
      ideaCreatesPerWeekCap: 2,
    });
  });

  it("audits an explicit settings update in the same transaction", async () => {
    const ownedDomains = ["saytwist.com"];
    const persisted = { id: "global", enabled: true, intensity: "LOW", workerBatchSize: 3, ownedDomains, configVersion: 2 };
    const tx = {
      growthSettings: {
        findUnique: vi.fn().mockResolvedValue({ ...persisted, enabled: false, configVersion: 1 }),
        upsert: mocks.upsert.mockResolvedValue(persisted),
      },
    };
    mocks.transaction.mockImplementationOnce(async (callback: (client: typeof tx) => unknown) => callback(tx));
    await expect(updateGrowthSettings({ enabled: true, intensity: "LOW", workerBatchSize: 3, ownedDomains }, "admin-1")).resolves.toBe(persisted);
    expect(mocks.activity).toHaveBeenCalledWith(expect.objectContaining({ action: "SETTINGS_UPDATED", fromState: "DISABLED", toState: "ENABLED" }), tx);
  });
  it("revokes only the exact activation and writes an audit event atomically", async () => {
    const expiresAt = new Date("2026-10-29T20:04:00.000Z");
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const tx = { growthSettings: { updateMany } };
    mocks.transaction.mockImplementationOnce(async (callback: (client: typeof tx) => unknown) => callback(tx));
    expect(await revokeGrowthWorkerActivation(expiresAt)).toBe(1);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "global", enabled: true, workerActivationExpiresAt: expiresAt },
      data: { enabled: false, workerActivationExpiresAt: null, configVersion: { increment: 1 } },
    });
    expect(mocks.activity).toHaveBeenCalledWith(
      expect.objectContaining({ action: "WORKER_ACTIVATION_REVOKED", fromState: "ENABLED", toState: "DISABLED" }),
      tx,
    );
  });

  it("leaves a replaced activation untouched and creates no false audit", async () => {
    const tx = { growthSettings: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) } };
    mocks.transaction.mockImplementationOnce(async (callback: (client: typeof tx) => unknown) => callback(tx));
    expect(await revokeGrowthWorkerActivation(new Date("2026-10-29T20:04:00.000Z"))).toBe(0);
    expect(mocks.activity).not.toHaveBeenCalled();
  });

});
