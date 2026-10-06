import { describe, expect, it } from "vitest";

import {
  DEFAULT_OWNED_PINTEREST_DOMAINS,
  isOwnedPinterestDestination,
  isPinterestInventoryFresh,
  ownedPinterestDomainsSchema,
} from "@/lib/growth/pinterest/relevance";

describe("Pinterest owned-domain relevance", () => {
  it.each([
    "https://saytwist.com/foo",
    "http://saytwist.com/foo",
    "https://www.saytwist.com/foo",
    "https://translator.whattypeof.com/foo",
    "https://SAYTWIST.COM:8443/foo",
  ])("accepts the exact configured hostname in %s", (url) => {
    expect(isOwnedPinterestDestination(url, DEFAULT_OWNED_PINTEREST_DOMAINS)).toBe(true);
  });

  it.each([
    "https://example.com/foo",
    "https://saytwist.com.evil.example/foo",
    "https://evil.example/?url=https://saytwist.com/foo",
    "javascript:alert(1)",
    "invalid URL",
    "",
  ])("rejects an unrelated or unsafe destination in %s", (url) => {
    expect(isOwnedPinterestDestination(url, DEFAULT_OWNED_PINTEREST_DOMAINS)).toBe(false);
  });

  it("normalizes case and whitespace while removing duplicates", () => {
    expect(ownedPinterestDomainsSchema.parse([" SAYTWIST.COM ", "Translator.WhatTypeOf.Com", "saytwist.com"])).toEqual([
      "saytwist.com", "translator.whattypeof.com",
    ]);
  });

  it.each([
    ["https://saytwist.com"], ["saytwist.com/path"], ["saytwist.com?x=1"],
    ["*.saytwist.com"], ["saytwist.com:443"], ["bad_host.example"], [],
  ])("rejects invalid domain configuration %j", (domains) => {
    expect(() => ownedPinterestDomainsSchema.parse(domains)).toThrow();
  });

  it("uses a strict 24-hour inventory freshness boundary", () => {
    const now = new Date("2026-10-06T12:00:00Z");
    expect(isPinterestInventoryFresh(new Date("2026-10-06T11:55:00Z"), now)).toBe(true);
    expect(isPinterestInventoryFresh(new Date("2026-10-05T13:00:00Z"), now)).toBe(true);
    expect(isPinterestInventoryFresh(new Date("2026-10-05T12:00:00Z"), now)).toBe(false);
    expect(isPinterestInventoryFresh(new Date("2026-10-06T12:01:00Z"), now)).toBe(true);
    expect(isPinterestInventoryFresh(null, now)).toBe(false);
  });
});
