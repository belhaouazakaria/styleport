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

import { getGrowthSettings, updateGrowthSettings } from "@/lib/growth/settings";

describe("Growth settings persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("defaults to disabled without writing a row", async () => {
    mocks.findUnique.mockResolvedValueOnce(null);
    const settings = await getGrowthSettings();
    expect(settings).toMatchObject({
      enabled: false,
      intensity: "BALANCED",
      workerBatchSize: 5,
      ownedDomains: ["saytwist.com", "www.saytwist.com", "translator.whattypeof.com"],
      configVersion: 1,
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
});
