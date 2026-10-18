import { GrowthAiOperationKind } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  advisoryLock: vi.fn(),
  findReservation: vi.fn(),
  create: vi.fn(),
  aggregate: vi.fn(),
  count: vi.fn(),
  settings: vi.fn(),
  activity: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { $transaction: mocks.transaction, growthAiBudgetReservation: { updateMany: vi.fn() } },
}));
vi.mock("@/lib/growth/activity", () => ({ recordGrowthActivity: mocks.activity }));

import { reserveGrowthAiBudget } from "@/lib/growth/economics/reservations";

describe("Growth AI reservation safety", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const tx = {
      $queryRaw: mocks.advisoryLock.mockResolvedValue([]),
      growthAiBudgetReservation: {
        findUnique: mocks.findReservation.mockResolvedValue(null),
        create: mocks.create.mockResolvedValue({ id: "reservation-1", reservedCents: 30 }),
        aggregate: mocks.aggregate.mockResolvedValue({ _sum: { reservedCents: 0 } }),
        count: mocks.count.mockResolvedValue(0),
      },
      growthSettings: { findUnique: mocks.settings.mockResolvedValue({
        enabled: true, aiDailyBudgetCents: 200, aiMonthlyBudgetCents: 3000, aiImagesPerDayCap: 3,
      }) },
    };
    mocks.transaction.mockImplementation(async (work: (tx: typeof tx) => Promise<unknown>) => work(tx));
    mocks.activity.mockResolvedValue(undefined);
  });

  const request = { requestKey: "one-api-call", kind: GrowthAiOperationKind.IMAGE, provider: "OPENAI",
    model: "gpt-image-2", pricingVersion: "verified-tariff-v1", priceCeilingCents: 30 };

  it("fails before starting a transaction when request pricing is missing", async () => {
    await expect(reserveGrowthAiBudget({ ...request, priceCeilingCents: null }))
      .rejects.toThrow("UNKNOWN_PRICE");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("locks settings before assessing and inserting", async () => {
    const result = await reserveGrowthAiBudget(request);
    expect(result).toMatchObject({ newlyReserved: true });
    expect(mocks.advisoryLock).toHaveBeenCalledTimes(1);
    expect(mocks.settings).toHaveBeenCalledTimes(1);
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.advisoryLock.mock.invocationCallOrder[0]).toBeLessThan(mocks.create.mock.invocationCallOrder[0]);
  });

  it("rejects a concurrent reservation when the day budget is exhausted", async () => {
    mocks.aggregate.mockResolvedValueOnce({ _sum: { reservedCents: 190 } });
    await expect(reserveGrowthAiBudget(request)).rejects.toThrow("DAILY_LIMIT");
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("counts image reservations and blocks after the three-image cap", async () => {
    mocks.count.mockResolvedValueOnce(3);
    await expect(reserveGrowthAiBudget(request)).rejects.toThrow("IMAGE_DAILY_LIMIT");
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("requires Growth to be enabled", async () => {
    mocks.settings.mockResolvedValueOnce({ enabled: false });
    await expect(reserveGrowthAiBudget(request)).rejects.toThrow("GROWTH_DISABLED");
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("reuses the same reservation record but forbids replay of a changed request", async () => {
    mocks.findReservation.mockResolvedValueOnce({
      id: "reservation-1", kind: "IMAGE", provider: "OPENAI",
      model: "gpt-image-2", pricingVersion: "verified-tariff-v1", reservedCents: 30,
    });
    const result = await reserveGrowthAiBudget(request);
    expect(result.newlyReserved).toBe(false);
    expect(mocks.create).not.toHaveBeenCalled();
    mocks.findReservation.mockResolvedValueOnce({
      id: "reservation-1", kind: "IMAGE", provider: "OPENAI",
      model: "different", pricingVersion: "verified-tariff-v1", reservedCents: 30,
    });
    await expect(reserveGrowthAiBudget(request)).rejects.toThrow("RESERVATION_IDEMPOTENCY_CONFLICT");
  });
});
