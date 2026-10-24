import { describe, expect, it, beforeEach, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  settings: vi.fn(), aggregate: vi.fn(), count: vi.fn(), recent: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    growthSettings: { findUnique: mocks.settings },
    growthAiBudgetReservation: {
      aggregate: mocks.aggregate, count: mocks.count, findMany: mocks.recent,
    },
  },
}));
import { getGrowthBudgetExposure, percentOfBudget } from "@/lib/growth/economics/exposure";

describe("Read-only Growth reserved-cost dashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.settings.mockResolvedValue({ enabled: false, aiDailyBudgetCents: 200, aiMonthlyBudgetCents: 3000, aiImagesPerDayCap: 3 });
    mocks.aggregate.mockResolvedValueOnce({ _sum: { reservedCents: 140 } }).mockResolvedValueOnce({ _sum: { reservedCents: 900 } });
    mocks.count.mockResolvedValueOnce(2).mockResolvedValueOnce(5);
    mocks.recent.mockResolvedValue([
      { id: "r1", kind: "IMAGE", createdAt: new Date(), reservedCents: 30, reconciledCents: null, status: "RESERVED" },
    ]);
  });

  it("reports UTC day/month conservative commitments without submitting requests", async () => {
    const result = await getGrowthBudgetExposure(new Date("2026-10-24T23:30:00Z"));
    expect(result).toMatchObject({
      growthEnabled: false, dailyReservedCents: 140, monthlyReservedCents: 900,
      dailyPercent: 70, monthlyPercent: 30, outstandingReservations: 5,
      imagesReservedToday: 2,
    });
    expect(mocks.aggregate).toHaveBeenNthCalledWith(1, {
      where: { createdAt: { gte: new Date("2026-10-24T00:00:00Z") } },
      _sum: { reservedCents: true },
    });
    expect(mocks.aggregate).toHaveBeenNthCalledWith(2, {
      where: { createdAt: { gte: new Date("2026-10-01T00:00:00Z") } },
      _sum: { reservedCents: true },
    });
    expect(mocks.recent).toHaveBeenCalledWith(expect.objectContaining({
      take: 20,
      select: expect.objectContaining({ usageEvidence: { select: expect.objectContaining({
        outcome: true, inputTokens: true, imageUnits: true, estimatedMicroUsd: true,
      }) } }),
    }));
  });

  it("refuses to turn missing configuration or invalid denominator into zero-percent safety", async () => {
    expect(percentOfBudget(10, null)).toBeNull();
    expect(percentOfBudget(0, 0)).toBeNull();
    expect(percentOfBudget(-5, 200)).toBeNull();
    expect(percentOfBudget(200, 200)).toBe(100);
  });
});
