import { describe, expect, it } from "vitest";

import {
  assertNoEmDash,
  containsEmDash,
  EM_DASH_CHARACTER,
  sanitizeGeneratedString,
  sanitizeGeneratedText,
} from "@/lib/text-sanitizer";

describe("generated text sanitizer", () => {
  it("rewrites generated prose and preserves normal hyphens", () => {
    const input = `Clear${EM_DASH_CHARACTER}natural copy stays well-written.`;
    const output = sanitizeGeneratedString(input);

    expect(output).toBe("Clear, natural copy stays well-written.");
    expect(output).toContain("well-written");
    expect(containsEmDash(output)).toBe(false);
  });

  it("recursively sanitizes FAQ, example, list, array, and object content", () => {
    const payload = {
      about: `A useful tool${EM_DASH_CHARACTER}built for real drafts.`,
      bestUses: [`Posts${EM_DASH_CHARACTER}especially short updates.`],
      examples: [{ originalText: "A normal-hyphen stays", transformedText: `Hello${EM_DASH_CHARACTER}welcome back.` }],
      faq: [{ question: `Why${EM_DASH_CHARACTER}does this help?`, answer: `It is focused${EM_DASH_CHARACTER}and practical.` }],
      untouched: 42,
    };

    const sanitized = sanitizeGeneratedText(payload);

    expect(containsEmDash(sanitized)).toBe(false);
    expect(sanitized.examples[0]?.originalText).toBe("A normal-hyphen stays");
    expect(sanitized.untouched).toBe(42);
    expect(() => assertNoEmDash(sanitized)).not.toThrow();
  });
});
