import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ generate: vi.fn(), reserve: vi.fn(), usage: vi.fn() }));
vi.mock("@/lib/openai", () => ({ generateOpenAIText: mocks.generate }));
vi.mock("@/lib/growth/economics/credential-policy", () => ({
  getGrowthOpenAiCredentials: () => ({ apiKey: "sk-test", project: "proj_test" }),
}));
vi.mock("@/lib/growth/economics/text-admission", () => ({ reserveGrowthTextAttempt: mocks.reserve }));
vi.mock("@/lib/growth/economics/usage-evidence", () => ({ appendGrowthAiUsageEvidence: mocks.usage }));

import { generateCreativeExample, OpenAICreativeExampleProvider } from "@/lib/growth/creative/example-provider";

const request = {
  translatorName: "Cold Hearted Translator",
  title: "Cold Hearted Message Translator",
  description: "Rewrite a message with a detached tone while preserving its meaning.",
  sourceLabel: "Original text",
  targetLabel: "Cold rewrite",
  promptSystem: "Rewrite with a detached style.",
  promptInstructions: "Keep it concise.",
  input: "Can we talk about this later?",
};

describe("Creative Lab AI example provider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.reserve.mockResolvedValue("res-creative-1");
    mocks.usage.mockResolvedValue({ id: "evidence-1" });
    mocks.generate.mockResolvedValue({ text: "We can talk later, if it still matters by then.", model: "test-model", promptTokens: 45, completionTokens: 12, totalTokens: 57 });
  });

  it("makes one bounded plain-text request and returns auditable metadata", async () => {
    const result = await new OpenAICreativeExampleProvider("creative-job-1").generate(request);
    expect(mocks.generate).toHaveBeenCalledTimes(1);
    expect(mocks.generate).toHaveBeenCalledWith(expect.objectContaining({ maxOutputTokens: 120, maximumAttemptsPerModel: 1, allowModelFallback: false }));
    expect(result).toEqual({
      input: request.input,
      output: "We can talk later, if it still matters by then.",
      metadata: { provider: "OPENAI", model: "test-model", promptTokens: 45, completionTokens: 12, totalTokens: 57 },
    });
  });

  it("rejects markup in provider output", async () => {
    mocks.generate.mockResolvedValueOnce({ text: "<script>bad output</script>", model: "test-model", promptTokens: null, completionTokens: null, totalTokens: null });
    await expect(new OpenAICreativeExampleProvider("creative-job-1").generate(request)).rejects.toThrow("markup");
  });

  it("prefers saved evidence and fails closed when AI fails", async () => {
    const provider = { generate: vi.fn().mockRejectedValue(new Error("provider unavailable")) };
    await expect(generateCreativeExample({ useAi: true, request, provider, assertGrowthEnabled: async () => {} })).rejects.toThrow("provider unavailable");
    expect(provider.generate).toHaveBeenCalledTimes(1);

    provider.generate.mockClear();
    const assertGrowthEnabled = vi.fn();
    const saved = await generateCreativeExample({ useAi: true, request, provider, assertGrowthEnabled, savedExample: { input: "Saved input", output: "Saved output" } });
    expect(saved).toMatchObject({ source: "SAVED", input: "Saved input", output: "Saved output" });
    expect(provider.generate).not.toHaveBeenCalled();
    expect(assertGrowthEnabled).not.toHaveBeenCalled();
  });

  it("checks Growth immediately before AI and audits only successful usage", async () => {
    const order: string[] = [];
    const provider = { generate: vi.fn(async () => { order.push("provider"); return { input: request.input, output: "We can talk later, if it still matters by then.", metadata: { provider: "OPENAI", model: "test", promptTokens: 10, completionTokens: 8, totalTokens: 18 } }; }) };
    const onAiUsage = vi.fn(async () => { order.push("audit"); });
    await expect(generateCreativeExample({ useAi: true, request, provider, assertGrowthEnabled: async () => { order.push("growth"); }, onAiUsage })).resolves.toMatchObject({ source: "AI" });
    expect(order).toEqual(["growth", "provider", "audit"]);

    provider.generate.mockClear();
    await expect(generateCreativeExample({ useAi: true, request, provider, assertGrowthEnabled: async () => { throw new Error("Growth disabled"); }, onAiUsage })).rejects.toThrow("Growth disabled");
    expect(provider.generate).not.toHaveBeenCalled();
  });
  it("blocks missing identity or spending admission before sending", async () => {
    await expect(new OpenAICreativeExampleProvider().generate(request))
      .rejects.toThrow("INVALID_TEXT_DECISION_ID");
    expect(mocks.generate).not.toHaveBeenCalled();
    mocks.reserve.mockRejectedValueOnce(new Error("budget unavailable"));
    await expect(new OpenAICreativeExampleProvider("creative-job-1").generate(request))
      .rejects.toThrow("budget unavailable");
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it("reserves one priced Growth attempt and records response tokens", async () => {
    await new OpenAICreativeExampleProvider("creative-job-3").generate(request);
    expect(mocks.reserve).toHaveBeenCalledWith(expect.objectContaining({
      decisionId: "creative-job-3", contentKind: "creative-example",
      attempt: 0, model: "gpt-4.1-mini", maxOutputTokens: 120,
    }));
    expect(mocks.generate).toHaveBeenCalledWith(expect.objectContaining({
      credentialScope: "GROWTH", maxOutputTokens: 120,
      sdkMaxRetries: 0, maximumAttemptsPerModel: 1, allowModelFallback: false,
    }));
    expect(mocks.usage).toHaveBeenCalledWith(expect.objectContaining({
      reservationId: "res-creative-1", outcome: "RESPONSE_RECEIVED",
    }));
  });
  it("does not retry an ambiguous provider error", async () => {
    mocks.generate.mockRejectedValueOnce(new Error("timeout"));
    await expect(new OpenAICreativeExampleProvider("creative-job-4").generate(request))
      .rejects.toThrow("CREATIVE_EXAMPLE_PROVIDER_OUTCOME_UNKNOWN");
    expect(mocks.generate).toHaveBeenCalledTimes(1);
    expect(mocks.usage).toHaveBeenCalledWith({
      reservationId: "res-creative-1", outcome: "OUTCOME_UNKNOWN",
    });
  });

});
