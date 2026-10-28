import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  existing: vi.fn(), insert: vi.fn(), winner: vi.fn(),
  count: vi.fn(), aggregate: vi.fn(), attributionStatus: vi.fn(),
  eligiblePinCount: vi.fn(), readyPinCount: vi.fn(), topPin: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    growthDailyReport: {
      findUnique: mocks.existing, create: mocks.insert, findUniqueOrThrow: mocks.winner,
    },
    growthPinterestAccount: { count: mocks.count },
    growthPinterestAccountMetricDaily: { count: mocks.count, aggregate: mocks.aggregate },
    growthAttributionDailyAggregate: { aggregate: mocks.aggregate, count: mocks.count },
    growthPinPublication: { count: mocks.count },
    growthContentVersion: { count: mocks.count },
    growthIdeaVersion: { count: mocks.count },
    growthAiBudgetReservation: { aggregate: mocks.aggregate },
    growthPinterestPin: { count: mocks.eligiblePinCount },
    growthPinterestPinMetricDaily: { count: mocks.readyPinCount, findFirst: mocks.topPin },
  },
}));
vi.mock("@/lib/growth/attribution/config", () => ({
  getAttributionCollectionStatus: mocks.attributionStatus,
}));
import { archiveGrowthDailyReport } from "@/lib/growth/reporting/archive";

const archived = {
  id: "growth-20261024",
  reportDate: new Date("2026-10-24T00:00:00.000Z"),
  digestText: "Existing digest remains unchanged",
};

describe("Insert-only daily report archive under immutable PostgreSQL trigger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.existing.mockResolvedValue(null);
    mocks.count.mockResolvedValue(0);
    mocks.eligiblePinCount.mockResolvedValue(0);
    mocks.readyPinCount.mockResolvedValue(0);
    mocks.topPin.mockResolvedValue(null);
    mocks.aggregate.mockResolvedValue({ _sum: { outboundClicks: null,
      landingSessions: null, qualifiedConversions: null } });
    mocks.attributionStatus.mockResolvedValue({ enabled: false });
    mocks.insert.mockResolvedValue(archived);
    mocks.winner.mockResolvedValue(archived);
  });
  it("creates a snapshot once without any upsert/update", async () => {
    const result = await archiveGrowthDailyReport("2026-10-24");
    expect(result).toEqual({ report: archived, reused: false });
    expect(mocks.insert).toHaveBeenCalledTimes(1);
    expect(mocks.winner).not.toHaveBeenCalled();
    const created = mocks.insert.mock.calls[0][0].data;
    expect(created.reportDate).toEqual(archived.reportDate);
    expect(created.version).toBe("growth_daily_v2");
    expect(created.digestText).toContain("Growth AI spend: Unavailable");
    expect(created.digestText).toContain("Growth AI actual spending not fully priced");
    expect(created.digestText).toContain("Review Pinterest analytics coverage");
    expect(created.snapshot.aiSpendUsd).toBeNull();
    expect(created.digestText).toContain("Growth AI reserved ceiling: $0.00 USD (not billed spend)");
  });
  it("identifies the top measured Pin only with complete eligible daily coverage", async () => {
    mocks.count.mockResolvedValue(1);
    mocks.eligiblePinCount.mockResolvedValue(1);
    mocks.readyPinCount.mockResolvedValue(1);
    mocks.topPin.mockResolvedValue({
      outboundClicks: BigInt(42),
      pin: { title: "Jester translator", pinterestPinId: "123456789012" },
    });
    mocks.aggregate.mockResolvedValue({ _sum: {
      outboundClicks: BigInt(42), reservedCents: 125,
      landingSessions: null, qualifiedConversions: null,
    } });
    await archiveGrowthDailyReport("2026-10-24");
    const created = mocks.insert.mock.calls[0][0].data;
    expect(created.digestText).toContain("Top measured Pin: Jester translator (42 outbound clicks)");
    expect(created.digestText).toContain("Growth AI reserved ceiling: $1.25 USD (not billed spend)");
    expect(created.digestText).toContain("Review attribution readiness");
    expect(created.snapshot.aiSpendUsd).toBeNull();
    expect(mocks.topPin).toHaveBeenCalledTimes(1);
  });
  it("rejects breakout rankings from partial eligible Pin coverage", async () => {
    mocks.count.mockResolvedValue(1);
    mocks.eligiblePinCount.mockResolvedValue(2);
    mocks.readyPinCount.mockResolvedValue(1);
    await archiveGrowthDailyReport("2026-10-24");
    expect(mocks.topPin).not.toHaveBeenCalled();
    expect(mocks.insert.mock.calls[0][0].data.digestText).toContain(
      "Breakout: Unavailable (no complete Pin-level evidence)");
  });
  it("on a concurrent P2002 insert collision reads the original report unchanged", async () => {
    mocks.insert.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError(
      "Unique constraint failed", { code: "P2002", clientVersion: "6.19.3" },
    ));
    const result = await archiveGrowthDailyReport("2026-10-24");
    expect(result).toEqual({ report: archived, reused: true });
    expect(mocks.insert).toHaveBeenCalledTimes(1);
    expect(mocks.winner).toHaveBeenCalledExactlyOnceWith({
      where: { reportDate: archived.reportDate },
    });
  });
  it("does not reinterpret other errors as an existing report", async () => {
    mocks.insert.mockRejectedValueOnce(new Error("Database unavailable"));
    await expect(archiveGrowthDailyReport("2026-10-24")).rejects.toThrow("Database unavailable");
    expect(mocks.winner).not.toHaveBeenCalled();
  });
});
