import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ list: vi.fn(), get: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: { growthDailyReport: { findMany: mocks.list, findUnique: mocks.get } },
}));
import { isValidGrowthReportId, listArchivedGrowthReports, getArchivedGrowthReport } from "@/lib/growth/reporting/admin";

describe("Protected Growth archived-report readers (ADMIN gate in calling pages)", () => {
  beforeEach(() => { vi.clearAllMocks(); });
  it("bounds the read-only report list and never reaches providers", async () => {
    mocks.list.mockResolvedValue([]);
    await listArchivedGrowthReports();
    expect(mocks.list).toHaveBeenCalledWith(expect.objectContaining({
      take: 30,
      orderBy: [{ reportDate: "desc" }, { id: "desc" }],
    }));
  });
  it("rejects unsafe ids before querying the database", async () => {
    for (const id of ["../admin", "growth-20261017/../../", "growth-2026-10-17", "growth-ABCDEF12", ""]) {
      expect(isValidGrowthReportId(id)).toBe(false);
      await expect(getArchivedGrowthReport(id)).resolves.toBeNull();
    }
    expect(mocks.get).not.toHaveBeenCalled();
  });
  it("supports archived digest links without writing or sending messages", async () => {
    mocks.get.mockResolvedValue({ id: "growth-20261017", digestText: "Archived digest" });
    expect(isValidGrowthReportId("growth-20261017")).toBe(true);
    await expect(getArchivedGrowthReport("growth-20261017")).resolves.toMatchObject({
      id: "growth-20261017",
    });
    expect(mocks.get).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "growth-20261017" },
    }));
  });
});
