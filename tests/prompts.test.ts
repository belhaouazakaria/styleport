import { describe, expect, it } from "vitest";

import { buildTranslatorPrompts } from "@/lib/prompt-builder";

describe("buildTranslatorPrompts", () => {
  const translator = {
    id: "tr_1",
    slug: "regal-rewrite",
    promptSystem: "Custom system prompt",
    promptInstructions: "Rewrite elegantly.",
    modelOverride: null,
    showModeSelector: true,
    modes: [
      {
        key: "classic-fancy",
        label: "Classic",
        instruction: "Use classic ornate style.",
      },
      {
        key: "formal",
        label: "Formal",
        instruction: "Be formal.",
      },
    ],
  };

  it("combines translator prompt layers", () => {
    const prompt = buildTranslatorPrompts({
      translator,
      userText: "hello there",
      modeKey: "formal",
    });

    expect(prompt.systemPrompt).toContain("Custom system prompt");
    expect(prompt.userPrompt).toContain("Rewrite elegantly.");
    expect(prompt.userPrompt).toContain("Mode: Formal");
    expect(prompt.userPrompt).toContain("hello there");
    expect(prompt.resolvedModeKey).toBe("formal");
  });

  it("falls back to first mode", () => {
    const prompt = buildTranslatorPrompts({
      translator,
      userText: "test",
      modeKey: "missing",
    });

    expect(prompt.resolvedModeKey).toBe("classic-fancy");
  });

  it("locks mode when selector disabled", () => {
    const prompt = buildTranslatorPrompts({
      translator: { ...translator, showModeSelector: false },
      userText: "test",
      modeKey: "formal",
    });

    expect(prompt.resolvedModeKey).toBe("classic-fancy");
  });
});
