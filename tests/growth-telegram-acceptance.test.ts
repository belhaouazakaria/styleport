import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ archive: vi.fn(), send: vi.fn() }));
vi.mock("@/lib/growth/reporting/archive", () => ({
  archiveGrowthDailyReport: mocks.archive,
}));
vi.mock("@/lib/growth/reporting/delivery", () => ({
  submitArchivedDailyReport: mocks.send,
}));
import { runControlledGrowthTelegramAcceptance } from "@/lib/growth/reporting/acceptance";

const now = new Date("2026-10-25T13:04:00.000Z");
const permitted = {
  GROWTH_TELEGRAM_ACCEPTANCE_ENABLED: "true",
  GROWTH_TELEGRAM_ACCEPTANCE_ENVIRONMENT: "isolated-staging",
  GROWTH_TELEGRAM_ACCEPTANCE_CONFIRMATION: "SEND ONE TELEGRAM REPORT growth-20261024",
  GROWTH_DAILY_REPORT_SCHEDULE_ENABLED: "false",
  TELEGRAM_REPORTS_ENABLED: "true",
  TELEGRAM_BOT_TOKEN: "123456789:" + "A".repeat(35),
  TELEGRAM_REPORT_CHAT_ID: "123456789",
};

describe("Controlled one-shot Telegram staging acceptance — never send in CI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.archive.mockResolvedValue({ report: { id: "growth-20261024" }, reused: false });
    mocks.send.mockResolvedValue({ status: "SUBMITTED", reportId: "growth-20261024" });
  });

  it("is completely inert by default and never touches DB or transport", async () => {
    expect(await runControlledGrowthTelegramAcceptance(now, {})).toEqual({ status: "DISABLED" });
    expect(await runControlledGrowthTelegramAcceptance(now, {
      ...permitted, GROWTH_TELEGRAM_ACCEPTANCE_ENABLED: "false",
    })).toEqual({ status: "DISABLED" });
    expect(mocks.archive).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("requires isolated staging, disabled normal schedule, exact day-bound message, recipient and 04:00 UTC", async () => {
    const blocked = [
      { ...permitted, GROWTH_TELEGRAM_ACCEPTANCE_ENVIRONMENT: "production" },
      { ...permitted, GROWTH_DAILY_REPORT_SCHEDULE_ENABLED: "true" },
      { ...permitted, GROWTH_TELEGRAM_ACCEPTANCE_CONFIRMATION: "SEND ONE TELEGRAM REPORT growth-20261023" },
      { ...permitted, TELEGRAM_REPORTS_ENABLED: "false" },
      { ...permitted, TELEGRAM_REPORT_CHAT_ID: "-10011111" },
    ];
    for (const configuration of blocked) {
      await expect(runControlledGrowthTelegramAcceptance(now, configuration)).rejects.toThrow();
    }
    await expect(runControlledGrowthTelegramAcceptance(
      new Date("2026-10-25T03:59:00Z"), permitted,
    )).rejects.toThrow("NOT_DUE");
    expect(mocks.archive).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("only sends the archived prior complete UTC day through the durable claim", async () => {
    await expect(runControlledGrowthTelegramAcceptance(now, permitted)).resolves.toEqual({
      status: "SUBMITTED", reportId: "growth-20261024", date: "2026-10-24",
      archiveReused: false,
    });
    expect(mocks.archive).toHaveBeenCalledExactlyOnceWith("2026-10-24");
    expect(mocks.send).toHaveBeenCalledExactlyOnceWith("growth-20261024");
    expect(mocks.archive.mock.invocationCallOrder[0]).toBeLessThan(mocks.send.mock.invocationCallOrder[0]);
  });

  it("never sends when the archive does not identify the confirmed day", async () => {
    mocks.archive.mockResolvedValue({ report: { id: "growth-20261023" }, reused: false });
    await expect(runControlledGrowthTelegramAcceptance(now, permitted)).rejects.toThrow("ARCHIVE_ID_MISMATCH");
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("propagates provider uncertainty or prior claim without any second send attempt", async () => {
    mocks.send.mockRejectedValue(new Error("ALREADY_ATTEMPTED_OUTCOME_UNKNOWN"));
    await expect(runControlledGrowthTelegramAcceptance(now, permitted))
      .rejects.toThrow("ALREADY_ATTEMPTED_OUTCOME_UNKNOWN");
    expect(mocks.send).toHaveBeenCalledTimes(1);
    // The caller never handles errors with a fallback or retry.
  });
});
