import { describe, expect, it } from "vitest";

import { RETIRED_TRANSLATOR_REDIRECTS } from "@/lib/seo/retired-translators";

describe("retired translator redirects", () => {
  it("redirects every retired slug permanently and without a hostname", () => {
    expect(RETIRED_TRANSLATOR_REDIRECTS).toHaveLength(18);
    for (const rule of RETIRED_TRANSLATOR_REDIRECTS) {
      expect(rule.source).toMatch(/^\/translators\/[a-z0-9-]+$/);
      expect(rule.permanent).toBe(true);
      expect(rule.destination).not.toMatch(/^https?:/);
    }
  });
  it("sends the snarky error translator and Russian 2.0 to their new homes", () => {
    const bysource = Object.fromEntries(RETIRED_TRANSLATOR_REDIRECTS.map((r) => [r.source, r.destination]));
    expect(bysource["/translators/error-message-translator-2"]).toBe("/translators/snarky-error-message-translator");
    expect(bysource["/translators/russian-2-0-translator"]).toBe("/translators/russian-translator");
    expect(bysource["/translators/russian-translator-2"]).toBe("/translators/russian-translator");
  });
  it("never redirects a page to itself", () => {
    for (const rule of RETIRED_TRANSLATOR_REDIRECTS) expect(rule.source).not.toBe(rule.destination);
  });
});
