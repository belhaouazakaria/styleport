import { describe, expect, it } from "vitest";

import { assessDistinctness, findTemplatePhrases, sharedPhraseRatio } from "@/lib/editorial-distinctness";
import type { TranslatorEditorialDraft } from "@/lib/types";

const draft = (about: string): TranslatorEditorialDraft => ({
  about, whatItDoes: "Rewrites sentences with period vocabulary.", differenceDescription: "It keeps modern facts but swaps words.",
  bestUses: ["Greeting cards"], howToUse: ["Paste a sentence"], tips: ["Keep sentences short"],
  examples: [{ contextTitle: "Invite", originalText: "Come to dinner", transformedText: "Pray, join us at table" }],
  faq: [{ question: "Is it historically exact?", answer: "No, it is an approximation." }],
});

describe("editorial distinctness", () => {
  it("flags template phrases including curly apostrophes", () => {
    expect(findTemplatePhrases(draft("Whether you’re writing a toast, this helps. Perfect for parties."))).toEqual(
      expect.arrayContaining(["whether you're", "perfect for"]),
    );
  });

  it("passes specific, original copy", () => {
    const result = assessDistinctness(draft("Swaps modern words for forms used in Victorian letters, such as 'post' for mail."), [
      { slug: "other", text: "Something entirely different about pirates and parrots on the high seas today." },
    ]);
    expect(result.passes).toBe(true);
  });

  it("fails copy that reuses another page's phrasing", () => {
    const shared = "the quick brown fox jumps over the lazy dog and keeps running far away from home";
    const result = assessDistinctness(draft(shared), [{ slug: "twin", text: shared }]);
    expect(result.passes).toBe(false);
    expect(result.closestSlug).toBe("twin");
  });

  it("measures shared 4-word phrases", () => {
    expect(sharedPhraseRatio("a b c d e f", "a b c d e f")).toBe(1);
    expect(sharedPhraseRatio("a b c d e f", "x y z q r s")).toBe(0);
  });
});
