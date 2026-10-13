import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  translators: vi.fn(),
  ideas: vi.fn(),
}));

vi.mock("@/lib/data/translators", () => ({
  getIndexableTranslatorSlugsForSitemap: mocks.translators,
}));
vi.mock("@/lib/data/ideas", () => ({
  getIndexableIdeaSlugsForSitemap: mocks.ideas,
}));
vi.mock("@/lib/env", () => ({
  getAppBaseUrl: () => new URL("https://saytwist.com"),
}));

import robots from "@/app/robots";
import sitemap, { dynamic as sitemapRenderingMode } from "@/app/sitemap";

describe("SEO route contracts", () => {
  beforeEach(() => {
    mocks.translators.mockResolvedValue([
      { slug: "friendly-rewrite", updatedAt: new Date("2026-10-01") },
    ]);
    mocks.ideas.mockResolvedValue([
      { slug: "better-follow-up", updatedAt: new Date("2026-10-02") },
    ]);
  });

  it("renders the sitemap against the VPS-local production database at request time", () => {
    expect(sitemapRenderingMode).toBe("force-dynamic");
  });

  it("emits unique canonical production URLs without query strings or private routes", async () => {
    const entries = await sitemap();
    const urls = entries.map((entry) => entry.url);
    expect(new Set(urls).size).toBe(urls.length);
    expect(urls).toContain("https://saytwist.com/translators/friendly-rewrite");
    expect(urls).toContain("https://saytwist.com/ideas/better-follow-up");
    expect(
      urls.every(
        (url) =>
          url.startsWith("https://saytwist.com/") ||
          url === "https://saytwist.com",
      ),
    ).toBe(true);
    expect(
      urls.every(
        (url) =>
          !url.includes("?") &&
          !url.includes("/admin") &&
          !url.includes("/api"),
      ),
    ).toBe(true);
  });

  it("omits invented static last-modified dates and preserves genuine content timestamps", async () => {
    const entries = await sitemap();
    const byUrl = new Map(entries.map((entry) => [entry.url, entry]));
    expect(byUrl.get("https://saytwist.com/about")).not.toHaveProperty(
      "lastModified",
    );
    expect(
      byUrl.get("https://saytwist.com/translators/friendly-rewrite")
        ?.lastModified,
    ).toEqual(new Date("2026-10-01"));
    expect(
      byUrl.get("https://saytwist.com/ideas/better-follow-up")?.lastModified,
    ).toEqual(new Date("2026-10-02"));
  });

  it("continues with static and Idea entries when translator data is unavailable", async () => {
    mocks.translators.mockRejectedValueOnce(
      new Error("optional service unavailable"),
    );
    const urls = (await sitemap()).map((entry) => entry.url);
    expect(urls).toContain("https://saytwist.com/about");
    expect(urls).toContain("https://saytwist.com/ideas/better-follow-up");
  });

  it("allows public crawling, blocks private surfaces, and references the production sitemap", () => {
    const result = robots();
    expect(result.sitemap).toEqual(["https://saytwist.com/sitemap.xml"]);
    expect(result.rules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ userAgent: "*", allow: "/" }),
      ]),
    );
    expect(JSON.stringify(result.rules)).toContain("/admin");
    expect(JSON.stringify(result.rules)).toContain("/api");
  });
});
