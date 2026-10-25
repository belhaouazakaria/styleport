import { describe, expect, it } from "vitest";
import { getGrowthOpenAiCredentials } from "@/lib/growth/economics/credential-policy";

const scope = {
  GROWTH_OPENAI_API_KEY: "sk-proj-GrowthSpecificKey123456789",
  GROWTH_OPENAI_PROJECT_ID: "proj_growth_abc123",
  OPENAI_API_KEY: "sk-proj-TranslationKey87654321",
};

describe("Dedicated Growth OpenAI credential isolation", () => {
  it("requires a private separate project and passes only Growth credentials", () => {
    expect(getGrowthOpenAiCredentials(scope)).toEqual({
      apiKey: scope.GROWTH_OPENAI_API_KEY,
      project: scope.GROWTH_OPENAI_PROJECT_ID,
    });
  });
  it("never falls back to the main website's ordinary translation key", () => {
    const invalid = [
      { ...scope, GROWTH_OPENAI_API_KEY: undefined },
      { ...scope, GROWTH_OPENAI_API_KEY: scope.OPENAI_API_KEY },
      { ...scope, GROWTH_OPENAI_PROJECT_ID: undefined },
      { ...scope, GROWTH_OPENAI_PROJECT_ID: "default" },
      { ...scope, GROWTH_OPENAI_API_KEY: "invalid-key" },
    ];
    for (const item of invalid) {
      expect(() => getGrowthOpenAiCredentials(item)).toThrow(
        "MISSING_OR_UNISOLATED_GROWTH_PROJECT",
      );
    }
  });
  it("never interpolates secrets into configuration errors", () => {
    try {
      getGrowthOpenAiCredentials({
        ...scope, GROWTH_OPENAI_PROJECT_ID: "bad-project",
      });
      throw new Error("Expected rejection");
    } catch (error) {
      const message = String(error);
      expect(message).not.toContain(scope.GROWTH_OPENAI_API_KEY);
      expect(message).not.toContain(scope.OPENAI_API_KEY);
    }
  });
});
