import { GrowthAiOperationKind, GrowthAiUsageOutcome } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ reservation: vi.fn(), insert: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    growthAiBudgetReservation: { findUnique: mocks.reservation },
    growthAiUsageEvent: { create: mocks.insert },
  },
}));
import { appendGrowthAiUsageEvidence, estimateGrowthTextMicroUsd } from "@/lib/growth/economics/usage-evidence";
import { GROWTH_TEXT_PRICE_VERSION } from "@/lib/growth/economics/text-admission";

describe("Append-only Growth AI request evidence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.reservation.mockResolvedValue({
      id: "reservation-1", kind: GrowthAiOperationKind.TEXT,
      model: "gpt-4.1-mini", pricingVersion: GROWTH_TEXT_PRICE_VERSION,
    });
    mocks.insert.mockImplementation(async ({ data }) => ({ id: "event-1", ...data }));
  });
  it("estimates text usage at a conservative uncached rate in integer micro USD", () => {
    expect(estimateGrowthTextMicroUsd({
      model: "gpt-4.1-mini", pricingVersion: GROWTH_TEXT_PRICE_VERSION,
      inputTokens: 1000, outputTokens: 500,
    })).toBe(BigInt(1200));
    expect(estimateGrowthTextMicroUsd({
      model: "unknown", pricingVersion: GROWTH_TEXT_PRICE_VERSION,
      inputTokens: 1000, outputTokens: 500,
    })).toBeNull();
    expect(estimateGrowthTextMicroUsd({
      model: "gpt-4.1-mini", pricingVersion: GROWTH_TEXT_PRICE_VERSION,
      inputTokens: null, outputTokens: 20,
    })).toBeNull();
  });
  it("appends provider-confirmed counters with only estimated, never actual, cost", async () => {
    await appendGrowthAiUsageEvidence({
      reservationId: "reservation-1", outcome: "RESPONSE_RECEIVED",
      responseId: "resp_123", inputTokens: 1000, outputTokens: 500, totalTokens: 1500,
    });
    expect(mocks.insert).toHaveBeenCalledWith({ data: {
      reservationId: "reservation-1", outcome: GrowthAiUsageOutcome.RESPONSE_RECEIVED,
      providerResponseId: "resp_123", inputTokens: 1000, outputTokens: 500,
      totalTokens: 1500, imageUnits: null, estimatedMicroUsd: BigInt(1200),
    } });
  });
  it("retains unknown outcome without inventing usage or settlement", async () => {
    await appendGrowthAiUsageEvidence({ reservationId: "reservation-1", outcome: "OUTCOME_UNKNOWN" });
    expect(mocks.insert).toHaveBeenCalledWith({ data: {
      reservationId: "reservation-1", outcome: GrowthAiUsageOutcome.OUTCOME_UNKNOWN,
    } });
  });
  it("does not invent image prices when the API has no verified token evidence", async () => {
    mocks.reservation.mockResolvedValueOnce({
      id: "reservation-2", kind: GrowthAiOperationKind.IMAGE,
      model: "gpt-image-2", pricingVersion: "image-pricing",
    });
    await appendGrowthAiUsageEvidence({
      reservationId: "reservation-2", outcome: "RESPONSE_RECEIVED",
      imageUnits: 1,
    });
    expect(mocks.insert).toHaveBeenCalledWith({ data: expect.objectContaining({
      imageUnits: 1, estimatedMicroUsd: null,
    }) });
  });
  it("rejects malformed IDs, inconsistent counters, and missing reservation", async () => {
    await expect(appendGrowthAiUsageEvidence({
      reservationId: "../bad", outcome: "RESPONSE_RECEIVED", responseId: "a/b",
    })).rejects.toThrow();
    await expect(appendGrowthAiUsageEvidence({
      reservationId: "reservation-1", outcome: "RESPONSE_RECEIVED", imageUnits: 1,
    })).rejects.toThrow();
    mocks.reservation.mockResolvedValueOnce(null);
    await expect(appendGrowthAiUsageEvidence({
      reservationId: "missing", outcome: "OUTCOME_UNKNOWN",
    })).rejects.toThrow("missing");
  });
  it("propagates duplicate event constraint, never overwriting existing history", async () => {
    mocks.insert.mockRejectedValueOnce(new Error("P2002"));
    await expect(appendGrowthAiUsageEvidence({
      reservationId: "reservation-1", outcome: "OUTCOME_UNKNOWN",
    })).rejects.toThrow("P2002");
    expect(mocks.insert).toHaveBeenCalledTimes(1);
  });
});
