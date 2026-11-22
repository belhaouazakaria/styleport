import { describe, expect, it } from "vitest";

import { RETIRED_TRANSLATOR_REDIRECTS } from "@/lib/seo/retired-translators";

describe("retired translator redirects", () => {
  it("redirects every -2 slug to its original, permanently and without a hostname", () => {
    expect(RETIRED_TRANSLATOR_REDIRECTS).toHaveLength(17);
    for (const rule of RETIRED_TRANSLATOR_REDIRECTS) {
      expect(rule.source).toMatch(/^\/translators\/.+-translator-2$/);
      expect(rule.destination).toBe(rule.source.replace(/-2$/, ""));
      expect(rule.permanent).toBe(true);
      expect(rule.destination).not.toMatch(/^https?:/);
    }
  });
  it("never redirects a page to itself", () => {
    for (const rule of RETIRED_TRANSLATOR_REDIRECTS) expect(rule.source).not.toBe(rule.destination);
  });
});
