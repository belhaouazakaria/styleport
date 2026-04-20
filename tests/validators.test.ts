import { describe, expect, it } from "vitest";

import { MAX_INPUT_CHARS } from "@/lib/constants";
import { translatorUpsertSchema, validateTranslateInput } from "@/lib/validators";

describe("validateTranslateInput", () => {
  it("accepts valid input", () => {
    const result = validateTranslateInput({
      text: "Hello there",
      modeKey: "classic-fancy",
      translatorSlug: "regal-rewrite",
    });

    expect(result.ok).toBe(true);
  });

  it("rejects whitespace-only input", () => {
    const result = validateTranslateInput({ text: "   " });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION_ERROR");
    }
  });

  it("rejects passage beyond max length", () => {
    const result = validateTranslateInput({ text: "a".repeat(MAX_INPUT_CHARS + 1) });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(413);
      expect(result.error.code).toBe("TOO_LONG");
    }
  });
});

describe("translatorUpsertSchema", () => {
  it("accepts robust translator payload", () => {
    const parsed = translatorUpsertSchema.safeParse({
      name: "Regal Rewrite",
      slug: "regal-rewrite",
      title: "Regal",
      subtitle: "Sub",
      shortDescription: "Desc",
      sourceLabel: "Plain",
      targetLabel: "Fancy",
      iconName: "",
      promptSystem: "System prompt with enough length",
      promptInstructions: "Instruction prompt with enough length",
      seoTitle: "",
      seoDescription: "",
      modelOverride: "",
      isActive: true,
      isFeatured: false,
      showModeSelector: false,
      showSwap: true,
      showExamples: false,
      sortOrder: 1,
      primaryCategoryId: "",
      categoryIds: ["cat_1"],
      modes: [
        {
          key: "classic-fancy",
          label: "Classic",
          description: "desc",
          instruction: "Use refined style for output",
          sortOrder: 1,
        },
      ],
      examples: [
        {
          label: "Greeting",
          value: "Hello there",
          sortOrder: 1,
        },
      ],
    });

    expect(parsed.success).toBe(true);
  });
});
