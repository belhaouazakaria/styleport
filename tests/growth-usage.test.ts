import { describe, expect, it } from "vitest";
import { summarizeGrowthUsage, type GrowthUsageEvent } from "@/lib/growth/economics/usage";

function event(partial: Partial<GrowthUsageEvent> = {}): GrowthUsageEvent {
  return {
    key: "decision-1", kind: "TEXT_DECISION", provider: "OPENAI", model: "gpt-test",
    responseId: "resp-1", decisionId: null, createdAt: new Date("2026-10-17T12:00:00Z"),
    inputTokens: 100, outputTokens: 50, totalTokens: 150,
    imageUnits: null, estimatedUsd: null, ...partial,
  };
}

describe("Growth AI usage evidence", () => {
  it("never invents an actual cost when provider cost is absent", () => {
    const result = summarizeGrowthUsage([event()], false);
    expect(result.unpricedRecords).toBe(1);
    expect(result.knownImageEstimatesUsd).toBe(0);
    expect(result.inputTokens).toBe(100);
    expect(result.outputTokens).toBe(50);
  });

  it("deduplicates text response metadata copied from a decision to an Idea version", () => {
    const result = summarizeGrowthUsage([
      event(),
      event({ key: "idea-version", kind: "IDEA_VERSION", decisionId: "decision-1" }),
    ], false);
    expect(result.textRequests).toBe(1);
    expect(result.inputTokens).toBe(100);
  });

  it("separately reports priced image estimates and unknown costs", () => {
    const result = summarizeGrowthUsage([
      event({ key: "image-1", kind: "AI_IMAGE", responseId: "img-1", imageUnits: 1,
        inputTokens: null, outputTokens: null, totalTokens: null, estimatedUsd: 0.06 }),
      event({ key: "image-2", kind: "AI_IMAGE", responseId: "img-2", imageUnits: 1,
        inputTokens: null, outputTokens: null, totalTokens: null, estimatedUsd: null }),
    ], false);
    expect(result.imageUnits).toBe(2);
    expect(result.unpricedRecords).toBe(1);
    expect(result.knownImageEstimatesUsd).toBeCloseTo(0.06);
  });

  it("does not hide partial data when the reporting cap is reached", () => {
    expect(summarizeGrowthUsage([], true).truncated).toBe(true);
  });
});
