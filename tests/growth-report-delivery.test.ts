import { describe, expect, it, vi, beforeEach } from "vitest";
const mocks = vi.hoisted(() => ({
  config: vi.fn(),
  submit: vi.fn(),
  transaction: vi.fn(),
  findReport: vi.fn(),
  upsertDelivery: vi.fn(),
  claimDelivery: vi.fn(),
  markDelivery: vi.fn(),
  query: vi.fn(),
}));
vi.mock("@/lib/growth/reporting/openwa", () => ({
  getOpenWaReportSettings: mocks.config,
  submitOpenWaDailyReport: mocks.submit,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
    growthReportDelivery: { updateMany: mocks.markDelivery },
  },
}));

import { GrowthReportDeliveryBlocked, submitArchivedDailyReport } from "@/lib/growth/reporting/delivery";
import { growthReportWindow } from "@/lib/growth/reporting/archive";

const config = {
  enabled: true, baseUrl: "http://127.0.0.1:8080",
  apiKey: "a-long-unguessable-server-only-key-for-openwa",
  recipientChatId: "213555123456@c.us",
};

describe("Once-only daily Growth WhatsApp report delivery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.config.mockReturnValue(config);
    mocks.query.mockResolvedValue([{ id: "growth-20261017" }]);
    mocks.findReport.mockResolvedValue({ id: "growth-20261017", digestText: "Digest" });
    mocks.upsertDelivery.mockResolvedValue({ id: "delivery-1", status: "READY" });
    mocks.claimDelivery.mockResolvedValue({ count: 1 });
    mocks.markDelivery.mockResolvedValue({ count: 1 });
    mocks.submit.mockResolvedValue({ submitted: true, messageId: "remote-message-1" });
    const tx = {
      $queryRaw: mocks.query,
      growthDailyReport: { findUniqueOrThrow: mocks.findReport },
      growthReportDelivery: { upsert: mocks.upsertDelivery, updateMany: mocks.claimDelivery },
    };
    mocks.transaction.mockImplementation(async (fn: (tx: typeof tx) => Promise<unknown>) => fn(tx));
  });

  it("rejects invalid IDs and a disabled provider before claiming a report", async () => {
    await expect(submitArchivedDailyReport("../admin")).rejects.toBeInstanceOf(GrowthReportDeliveryBlocked);
    mocks.config.mockReturnValueOnce({ ...config, enabled: false });
    await expect(submitArchivedDailyReport("growth-20261017")).rejects.toThrow("CHANNEL_DISABLED");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("claims before exactly one external submission and records provider message ID", async () => {
    await expect(submitArchivedDailyReport("growth-20261017")).resolves.toMatchObject({
      status: "SUBMITTED", reportId: "growth-20261017",
    });
    expect(mocks.query).toHaveBeenCalledTimes(1);
    expect(mocks.claimDelivery).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "delivery-1", status: "READY" },
      data: expect.objectContaining({ status: "SENDING" }),
    }));
    expect(mocks.submit).toHaveBeenCalledTimes(1);
    expect(mocks.claimDelivery.mock.invocationCallOrder[0]).toBeLessThan(mocks.submit.mock.invocationCallOrder[0]);
    expect(mocks.markDelivery).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "SUBMITTED", providerMessageId: "remote-message-1" }),
    }));
  });

  it("blocks any retry after a SENDING / unknown / submitted state", async () => {
    for (const state of ["SENDING", "SUBMITTED", "OUTCOME_UNKNOWN"]) {
      mocks.upsertDelivery.mockResolvedValueOnce({ id: "delivery-1", status: state });
      await expect(submitArchivedDailyReport("growth-20261017")).rejects.toThrow("ALREADY_ATTEMPTED");
    }
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it("marks delivery uncertain after a transport failure and never retries", async () => {
    mocks.submit.mockRejectedValueOnce(new Error("Network read timed out"));
    await expect(submitArchivedDailyReport("growth-20261017"))
      .rejects.toThrow("OUTCOME_UNKNOWN_REQUIRES_OPERATOR_REVIEW");
    expect(mocks.submit).toHaveBeenCalledTimes(1);
    expect(mocks.markDelivery).toHaveBeenCalledWith(expect.objectContaining({
      data: { status: "OUTCOME_UNKNOWN" },
    }));
  });

  it("also blocks retries when persistence fails after external submission", async () => {
    mocks.markDelivery.mockRejectedValueOnce(new Error("Database unavailable"));
    await expect(submitArchivedDailyReport("growth-20261017"))
      .rejects.toThrow("OUTCOME_UNKNOWN_REQUIRES_OPERATOR_REVIEW");
    expect(mocks.submit).toHaveBeenCalledTimes(1);
  });
});

describe("Daily report date validation", () => {
  it("uses fully completed UTC days", () => {
    expect(growthReportWindow("2026-10-17", new Date("2026-10-18T00:00:00Z")).end.toISOString())
      .toBe("2026-10-18T00:00:00.000Z");
    expect(() => growthReportWindow("2026-10-18", new Date("2026-10-18T12:00:00Z"))).toThrow();
    expect(() => growthReportWindow("2026-02-30", new Date("2026-10-18T12:00:00Z"))).toThrow();
  });
});
