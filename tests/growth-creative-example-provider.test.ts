import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock("@/lib/openai", () => ({ generateOpenAIText: mocks.generate }));

import { generateCreativeExampleWithFallback, OpenAICreativeExampleProvider } from "@/lib/growth/creative/example-provider";

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
    mocks.generate.mockResolvedValue({ text: "We can talk later, if it still matters by then.", model: "test-model", promptTokens: 45, completionTokens: 12, totalTokens: 57 });
  });

  it("makes one bounded plain-text request and returns auditable metadata", async () => {
    const result = await new OpenAICreativeExampleProvider().generate(request);
    expect(mocks.generate).toHaveBeenCalledTimes(1);
    expect(mocks.generate).toHaveBeenCalledWith(expect.objectContaining({ maxOutputTokens: 120 }));
    expect(result).toEqual({
      input: request.input,
      output: "We can talk later, if it still matters by then.",
      metadata: { provider: "OPENAI", model: "test-model", promptTokens: 45, completionTokens: 12, totalTokens: 57 },
    });
  });

  it("rejects markup in provider output", async () => {
    mocks.generate.mockResolvedValueOnce({ text: "<script>bad output</script>", model: "test-model", promptTokens: null, completionTokens: null, totalTokens: null });
    await expect(new OpenAICreativeExampleProvider().generate(request)).rejects.toThrow("markup");
  });

  it("prefers saved evidence and falls back deterministically when AI fails", async () => {
    const provider = { generate: vi.fn().mockRejectedValue(new Error("provider unavailable")) };
    const fallback = await generateCreativeExampleWithFallback({ useAi: true, request, provider });
    expect(fallback).toMatchObject({ source: "DETERMINISTIC", input: request.input, output: "We can talk later, if it still matters by then." });
    expect(provider.generate).toHaveBeenCalledTimes(1);

    provider.generate.mockClear();
    const saved = await generateCreativeExampleWithFallback({ useAi: true, request, provider, savedExample: { input: "Saved input", output: "Saved output" } });
    expect(saved).toMatchObject({ source: "SAVED", input: "Saved input", output: "Saved output" });
    expect(provider.generate).not.toHaveBeenCalled();
  });
});
