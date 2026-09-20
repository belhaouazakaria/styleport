import { describe, expect, it } from "vitest";

import { getMissingEditorialSections, mergeEditorialDraft, validateEditorialDraft } from "@/lib/editorial-job-utils";
import type { TranslatorEditorialDraft } from "@/lib/types";

const complete: TranslatorEditorialDraft = {
  about: "A useful translator description that is comfortably longer than the editorial readiness threshold.",
  whatItDoes: "It changes the tone and phrasing of text while preserving meaning, intent, and the original facts.",
  differenceDescription: "This translator is grounded in a specific voice instead of generic rewriting or keyword filler.",
  bestUses: ["Social captions", "Short announcements"],
  howToUse: ["Paste a draft", "Review the twist"],
  tips: ["Use clear input", "Keep the key detail"],
  examples: [
    { contextTitle: "One", originalText: "Hello there", transformedText: "Well hello, superstar" },
    { contextTitle: "Two", originalText: "Please reply", transformedText: "Send a reply when you can" },
    { contextTitle: "Three", originalText: "Thank you", transformedText: "Much appreciated" },
  ],
  faq: [
    { question: "Does it preserve meaning?", answer: "Yes, the instructions explicitly ask it to preserve meaning and facts." },
    { question: "Can I edit the result?", answer: "Yes, generated material is a draft for review." },
    { question: "What input works best?", answer: "Clear, complete sentences give the most useful result." },
  ],
};

describe("editorial generation safety", () => {
  it("identifies only incomplete sections", () => {
    expect(getMissingEditorialSections(complete)).toEqual(new Set());
    expect(getMissingEditorialSections({ ...complete, about: "" })).toEqual(new Set(["about"]));
  });

  it("preserves published sections for missing-content generation", () => {
    const current = { ...complete, about: "Existing approved copy that must not be overwritten." };
    const generated = { ...complete, about: "New AI copy that should remain a draft." };
    const merged = mergeEditorialDraft(current, generated, "GENERATE_MISSING");
    expect(merged.about).toBe(current.about);
  });

  it("validates a complete draft and flags exact duplicate values", () => {
    const result = validateEditorialDraft(complete);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.duplicateFlags.length).toBeGreaterThanOrEqual(0);
  });
});
