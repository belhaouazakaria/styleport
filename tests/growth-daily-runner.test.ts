import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  archive: vi.fn(),
  send: vi.fn(),
}));
vi.mock("@/lib/growth/reporting/archive", () => ({
  archiveGrowthDailyReport: mocks.archive,
}));
vi.mock("@/lib/growth/reporting/delivery", () => ({
  submitArchivedDailyReport: mocks.send,
}));

import { dueGrowthReportDate, runScheduledGrowthDailyReport } from "@/lib/growth/reporting/daily-runner";

const valid = {
  GROWTH_DAILY_REPORT_SCHEDULE_ENABLED: "true",
  TELEGRAM_REPORTS_ENABLED: "true",
  TELEGRAM_BOT_TOKEN: "123456789:" + "A".repeat(35),
  TELEGRAM_REPORT_CHAT_ID: "123456789",
};
const clock = new Date("2026-10-25T06:15:00Z");
describe("Disabled-by-default UTC daily report runner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.archive.mockResolvedValue({ report: { id: "growth-20261024" }, reused: false });
    mocks.send.mockResolvedValue({ status: "SUBMITTED", reportId: "growth-20261024" });
  });
  it("never calls database or transport unless both opt-in switches are enabled", async () => {
    expect(await runScheduledGrowthDailyReport(clock, {})).toEqual({ status: "DISABLED" });
    expect(await runScheduledGrowthDailyReport(clock, {
      ...valid, GROWTH_DAILY_REPORT_SCHEDULE_ENABLED: "false",
    })).toEqual({ status: "DISABLED" });
    expect(await runScheduledGrowthDailyReport(clock, {
      ...valid, TELEGRAM_REPORTS_ENABLED: "false",
    })).toEqual({ status: "DISABLED" });
    expect(mocks.archive).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("fails closed on invalid bot config without archiving", async () => {
    await expect(runScheduledGrowthDailyReport(clock, {
      ...valid, TELEGRAM_REPORT_CHAT_ID: "-100123",
    })).rejects.toThrow("INVALID_CONFIGURATION");
    expect(mocks.archive).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("does not send before 04:00 UTC or for an incomplete calendar day", async () => {
    expect(dueGrowthReportDate(new Date("2027-01-01T03:59:59Z"))).toBeNull();
    expect(dueGrowthReportDate(new Date("2027-01-01T04:00:00Z"))).toBe("2026-12-31");
    expect(await runScheduledGrowthDailyReport(new Date("2026-10-25T03:59:59Z"), valid))
      .toEqual({ status: "NOT_DUE" });
    expect(mocks.archive).not.toHaveBeenCalled();
  });
  it("archives yesterday UTC and attempts exactly one immutable delivery", async () => {
    await expect(runScheduledGrowthDailyReport(clock, valid)).resolves.toMatchObject({
      status: "SUBMITTED", date: "2026-10-24", reportId: "growth-20261024",
    });
    expect(mocks.archive).toHaveBeenCalledExactlyOnceWith("2026-10-24");
    expect(mocks.send).toHaveBeenCalledExactlyOnceWith("growth-20261024");
    expect(mocks.archive.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.send.mock.invocationCallOrder[0],
    );
  });
  it("does not retry or trigger an alternate transport after ambiguous outcome", async () => {
    mocks.send.mockRejectedValueOnce(new Error("OUTCOME_UNKNOWN_REQUIRES_OPERATOR_REVIEW"));
    await expect(runScheduledGrowthDailyReport(clock, valid))
      .rejects.toThrow("OUTCOME_UNKNOWN_REQUIRES_OPERATOR_REVIEW");
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });
});
