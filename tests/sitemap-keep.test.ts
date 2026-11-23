import { describe, expect, it } from "vitest";

import { isSitemapWorthy, SITEMAP_KEEP_SLUGS } from "@/lib/seo/sitemap-keep";

describe("sitemap curation", () => {
  it("keeps pages with unique blocks", () => {
    expect(isSitemapWorthy("any-new-translator", true)).toBe(true);
  });

  it("keeps proven pages from the keep-list", () => {
    expect(SITEMAP_KEEP_SLUGS.has("flirty-translator")).toBe(true);
    expect(isSitemapWorthy("flirty-translator", false)).toBe(true);
  });

  it("leaves out templated pages without unique content", () => {
    expect(isSitemapWorthy("some-templated-translator", false)).toBe(false);
  });
});
