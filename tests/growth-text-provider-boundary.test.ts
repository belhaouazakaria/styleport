import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  reserve: vi.fn(),
  generate: vi.fn(),
  record: vi.fn(),
  model: "gpt-4.1-mini",
}));
vi.mock("@/lib/growth/economics/text-admission", () => ({
  reserveGrowthTextAttempt: mocks.reserve,
}));
vi.mock("@/lib/growth/economics/reservations", () => ({
  GrowthBudgetBlockedError: class extends Error {
    constructor(public reason: string) { super(reason); }
  },
}));
vi.mock("@/lib/openai", () => ({ generateOpenAIText: mocks.generate }));
vi.mock("@/lib/growth/economics/credential-policy", () => ({ getGrowthOpenAiCredentials: () => ({ apiKey: "test-key", project: "proj_test" }) }));
vi.mock("@/lib/growth/economics/usage-evidence", () => ({ appendGrowthAiUsageEvidence: mocks.record }));
vi.mock("@/lib/env", () => ({
  getServerEnv: () => ({ OPENAI_MODEL: mocks.model }),
}));

import { OpenAITranslatorGenerationProvider, generateWithOneRepair } from "@/lib/growth/translator/generation";
import { GrowthBudgetBlockedError } from "@/lib/growth/economics/reservations";
import { OpenAIIdeaGenerationProvider } from "@/lib/growth/ideas/generation";

const evidence = {
  opportunityType: "FILL_INVENTORY_GAP", clusterName: "funny", score: 90,
  confidence: 90, reasonCodes: [], categoryOptions: [],
  relatedTranslators: [], representativePins: [],
};
const translator = {
  ...evidence, action: "CREATE_TRANSLATOR" as const, intendedNeed: "Fresh original tool",
};
const idea = {
  ...evidence, action: "CREATE_IDEA" as const, existingIdeas: [],
};

describe("Paid Growth text generation boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.model = "gpt-4.1-mini";
    mocks.reserve.mockResolvedValue("reservation-1");
    mocks.record.mockResolvedValue({ id: "usage-1" });
    mocks.generate.mockResolvedValue({
      model: "gpt-4.1-mini", text: "{}", promptTokens: 20,
      completionTokens: 30, totalTokens: 50,
    });
  });

  it("never calls provider if Translator spending admission is denied", async () => {
    mocks.reserve.mockRejectedValueOnce(new Error("Budget blocked"));
    await expect(new OpenAITranslatorGenerationProvider("decision-1").generate(translator))
      .rejects.toThrow("Budget blocked");
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.reserve).toHaveBeenCalledWith(expect.objectContaining({
      decisionId: "decision-1", contentKind: "translator", attempt: 0,
      model: "gpt-4.1-mini", maxOutputTokens: 2600,
    }));
  });

  it("uses one pinned Translator provider request without hidden fallback", async () => {
    await expect(new OpenAITranslatorGenerationProvider("decision-1").generate(translator))
      .rejects.toThrow();
    expect(mocks.generate).toHaveBeenCalledTimes(1);
    expect(mocks.generate).toHaveBeenCalledWith(expect.objectContaining({
      model: "gpt-4.1-mini", maxOutputTokens: 2600,
      maximumAttemptsPerModel: 1, allowModelFallback: false, sdkMaxRetries: 0,
    }));
    expect(mocks.reserve.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.generate.mock.invocationCallOrder[0],
    );
  });

  it("denies Idea generation before a paid request if reservation fails", async () => {
    mocks.reserve.mockRejectedValueOnce(new Error("Daily cap reached"));
    await expect(new OpenAIIdeaGenerationProvider("decision-2").generate(idea))
      .rejects.toThrow("Daily cap reached");
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("reserves a distinct repair attempt and disables fallback for Ideas", async () => {
    await expect(new OpenAIIdeaGenerationProvider("decision-2").generate(idea, {
      attempt: 1, issue: "Quality check failed",
    })).rejects.toThrow();
    expect(mocks.reserve).toHaveBeenCalledWith(expect.objectContaining({
      decisionId: "decision-2", contentKind: "idea", attempt: 1,
      maxOutputTokens: 4200,
    }));
    expect(mocks.generate).toHaveBeenCalledTimes(1);
    expect(mocks.generate).toHaveBeenCalledWith(expect.objectContaining({
      model: "gpt-4.1-mini", maxOutputTokens: 4200,
      maximumAttemptsPerModel: 1, allowModelFallback: false, sdkMaxRetries: 0,
    }));
  });

  it("does not attempt any repair after a budget-blocked or ambiguous error", async () => {
    const provider = { generate: vi.fn().mockRejectedValue(new GrowthBudgetBlockedError("TEXT_PROVIDER_OUTCOME_UNKNOWN")) };
    await expect(generateWithOneRepair(provider as never, translator as never))
      .rejects.toThrow("TEXT_PROVIDER_OUTCOME_UNKNOWN");
    expect(provider.generate).toHaveBeenCalledTimes(1);
  });

  it("does not blindly retry an ambiguous paid request", async () => {
    mocks.generate.mockRejectedValueOnce(new Error("Provider timeout"));
    await expect(new OpenAITranslatorGenerationProvider("decision-3").generate(translator))
      .rejects.toThrow("TEXT_PROVIDER_OUTCOME_UNKNOWN");
    expect(mocks.generate).toHaveBeenCalledTimes(1);
    expect(mocks.record).toHaveBeenCalledWith({ reservationId: "reservation-1", outcome: "OUTCOME_UNKNOWN" });
  });
});
