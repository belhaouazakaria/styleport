import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  existing: vi.fn(), insert: vi.fn(), winner: vi.fn(),
  count: vi.fn(), aggregate: vi.fn(), attributionStatus: vi.fn(),
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
    expect(created.digestText).toContain("Growth AI spend: Unavailable");
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
