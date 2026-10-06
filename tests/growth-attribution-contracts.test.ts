import { afterEach, describe, expect, it, vi } from "vitest";

import { attributionLandingSchema } from "@/lib/growth/attribution/contracts";
import { isAttributionEnvironmentEnabled } from "@/lib/growth/attribution/config";
import {
  ATTRIBUTION_MODEL_VERSION,
  ATTRIBUTION_PUBLIC_REF_PATTERN,
} from "@/lib/growth/attribution/constants";
import { generateAttributionPublicRef } from "@/lib/growth/attribution/refs";
import {
  attributionCookieOptions,
  generateAttributionSessionToken,
  hashAttributionSessionToken,
} from "@/lib/growth/attribution/sessions";
import {
  attributionRequestAllowed,
  isAttributionPrefetch,
  isKnownAttributionBot,
} from "@/lib/growth/attribution/traffic";
import {
  buildAttributionUrl,
  destinationMatchesRef,
  destinationPathFromUrl,
  normalizeAttributionDestinationPath,
} from "@/lib/growth/attribution/urls";

describe("Growth attribution contracts", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("creates opaque URL-safe refs and browser tokens with sufficient entropy", () => {
    const refs = new Set(
      Array.from({ length: 100 }, () => generateAttributionPublicRef()),
    );
    expect(refs.size).toBe(100);
    for (const ref of refs) expect(ref).toMatch(ATTRIBUTION_PUBLIC_REF_PATTERN);
    const token = generateAttributionSessionToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(hashAttributionSessionToken(token)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashAttributionSessionToken(token)).not.toContain(token);
  });

  it("builds deterministic canonical URLs with exact Pinterest parameters", () => {
    vi.stubEnv("APP_BASE_URL", "https://saytwist.com");
    const ref = {
      publicRef: generateAttributionPublicRef(),
      destinationPath: "/translators/regal?mode=classic&utm_source=old",
      campaignKey: "saytwist",
      contentKey: "regal-v1",
    };
    const first = buildAttributionUrl(ref);
    expect(buildAttributionUrl(ref)).toBe(first);
    const url = new URL(first);
    expect(url.origin).toBe("https://saytwist.com");
    expect(url.searchParams.get("mode")).toBe("classic");
    expect(url.searchParams.get("utm_source")).toBe("pinterest");
    expect(url.searchParams.get("utm_medium")).toBe("organic");
    expect(url.searchParams.get("utm_campaign")).toBe("saytwist");
    expect(url.searchParams.get("utm_content")).toBe("regal-v1");
    expect(url.searchParams.get("pin_ref")).toBe(ref.publicRef);
  });

  it("rejects unsafe or cross-origin destination paths", () => {
    const base = new URL("https://saytwist.com");
    expect(() =>
      normalizeAttributionDestinationPath("https://evil.example/a", base),
    ).toThrow();
    expect(() =>
      normalizeAttributionDestinationPath("//evil.example/a", base),
    ).toThrow();
    expect(() =>
      normalizeAttributionDestinationPath("/a#fragment", base),
    ).toThrow();
    expect(
      destinationMatchesRef(
        "/translators/a?mode=x",
        "/translators/a?mode=x",
        base,
      ),
    ).toBe(true);
    expect(
      destinationMatchesRef("/translators/b", "/translators/a", base),
    ).toBe(false);
  });

  it("canonicalizes the approved legacy translator origin without accepting arbitrary origins", () => {
    const base = new URL("https://saytwist.com");
    expect(
      destinationPathFromUrl(
        "https://translator.whattypeof.com/translators/gen-z?mode=classic",
        base,
      ),
    ).toBe("/translators/gen-z?mode=classic");
    expect(
      buildAttributionUrl(
        {
          publicRef: `pa_${"a".repeat(32)}`,
          destinationPath: destinationPathFromUrl(
            "https://translator.whattypeof.com/translators/gen-z",
            base,
          ),
          campaignKey: "saytwist",
          contentKey: "gen-z",
        },
        base,
      ),
    ).toMatch(/^https:\/\/saytwist\.com\/translators\/gen-z\?/);
    expect(() =>
      destinationPathFromUrl("https://evil.example/translators/gen-z", base),
    ).toThrow();
    expect(() => destinationPathFromUrl("javascript:alert(1)", base)).toThrow();
  });

  it("requires exact source, medium, ref format, and bounded landing fields", () => {
    const valid = {
      pinRef: generateAttributionPublicRef(),
      utmSource: "pinterest",
      utmMedium: "organic",
      utmCampaign: "saytwist",
      utmContent: "content",
      destinationPath: "/translators/a",
      eventKey: "1234567890abcdef",
    };
    expect(attributionLandingSchema.safeParse(valid).success).toBe(true);
    expect(
      attributionLandingSchema.safeParse({ ...valid, utmSource: "google" })
        .success,
    ).toBe(false);
    expect(
      attributionLandingSchema.safeParse({ ...valid, utmMedium: "paid" })
        .success,
    ).toBe(false);
    expect(
      attributionLandingSchema.safeParse({ ...valid, pinRef: "pin-123" })
        .success,
    ).toBe(false);
  });

  it("uses secure bounded cookie attributes", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(attributionCookieOptions({ attributionWindowDays: 7 })).toEqual({
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
      maxAge: 604_800,
    });
  });

  it.each([
    [undefined, false],
    ["", false],
    ["false", false],
    ["FALSE", false],
    ["0", false],
    ["malformed", false],
    ["true", true],
    ["TRUE", true],
    ["1", true],
  ])("parses the server collection gate value %s as %s", (value, expected) => {
    vi.stubEnv("GROWTH_ATTRIBUTION_COLLECTION_ENABLED", value);
    expect(isAttributionEnvironmentEnabled()).toBe(expected);
  });

  it("filters bot, prefetch, cross-origin, and excessive public requests without persistence", () => {
    vi.stubEnv("APP_BASE_URL", "https://saytwist.com");
    const request = (headers: Record<string, string>) =>
      new Request("https://saytwist.com/api/growth/attribution/landing", {
        method: "POST",
        headers: {
          origin: "https://saytwist.com",
          "sec-fetch-site": "same-origin",
          "user-agent": "Mozilla/5.0",
          "x-real-ip": "127.0.0.77",
          ...headers,
        },
      });
    expect(isKnownAttributionBot(request({ "user-agent": "Googlebot" }))).toBe(
      true,
    );
    expect(isAttributionPrefetch(request({ purpose: "prefetch" }))).toBe(true);
    expect(
      attributionRequestAllowed(request({ origin: "https://evil.example" })),
    ).toBe(false);
    expect(attributionRequestAllowed(request({}))).toBe(true);
  });

  it("keeps the accepted model version immutable in application code", () => {
    expect(ATTRIBUTION_MODEL_VERSION).toBe("pinterest_organic_v1");
  });
});
