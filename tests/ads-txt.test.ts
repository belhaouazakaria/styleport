import { afterEach, describe, expect, it, vi } from "vitest";

import nextConfig from "@/next.config";
import { GET as getLegacyAdsTxt } from "@/app/ads.txt/route";
import {
  advertisingPermittedForHost,
  isLegacyTranslatorHostname,
} from "@/lib/legacy-domain";

const EZOIC_ADS_TXT_URL = "https://srv.adstxtmanager.com/19390/saytwist.com";

afterEach(() => vi.unstubAllEnvs());

describe("two-domain routing and ads.txt safety", () => {
  it("preserves SayTwist's 301 seller redirect on its own host only", async () => {
    const redirects = await nextConfig.redirects!();
    const ezoic = redirects.filter((item) => item.destination === EZOIC_ADS_TXT_URL);

    expect(ezoic).toHaveLength(2);
    expect(ezoic.map((item) => item.has?.[0])).toEqual([
      { type: "host", value: "saytwist.com" },
      { type: "host", value: "www.saytwist.com" },
    ]);
    expect(ezoic.every((item) => item.source === "/ads.txt" && item.statusCode === 301)).toBe(true);
  });

  it("serves singular legacy host but preserves plural historical alias redirects", async () => {
    const redirects = await nextConfig.redirects!();
    const hostRedirects = redirects.filter((item) =>
      item.has?.some((condition) => condition.type === "host" &&
        condition.value.endsWith(".whattypeof.com")),
    );
    expect(hostRedirects).toHaveLength(2);
    expect(hostRedirects.every((item) =>
      item.has?.[0]?.value === "translators.whattypeof.com" &&
      item.permanent === true,
    )).toBe(true);
    expect(hostRedirects.map((item) => item.source)).toEqual(["/", "/:path+"]);
  });

  it("requires an exact legacy hostname and explicit advertising approval", () => {
    expect(isLegacyTranslatorHostname("translator.whattypeof.com")).toBe(true);
    expect(isLegacyTranslatorHostname("TRANSLATOR.WHATTYPEOF.COM:443")).toBe(true);
    expect(isLegacyTranslatorHostname("translator.whattypeof.com:80")).toBe(true);
    expect(isLegacyTranslatorHostname("translator.whattypeof.com.attacker.test")).toBe(false);
    expect(advertisingPermittedForHost("translator.whattypeof.com", undefined)).toBe(false);
    expect(advertisingPermittedForHost("translator.whattypeof.com", "false")).toBe(false);
    expect(advertisingPermittedForHost("translator.whattypeof.com", "true")).toBe(true);
    expect(advertisingPermittedForHost("saytwist.com", undefined)).toBe(true);
  });

  it("does not reuse SayTwist seller authorization on legacy host", async () => {
    vi.stubEnv("LEGACY_TRANSLATOR_ADS_TXT", "");
    const request = new Request("https://translator.whattypeof.com/ads.txt", {
      headers: { host: "translator.whattypeof.com" },
    });
    const response = await getLegacyAdsTxt(request);
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("serves only explicitly configured legacy seller lines", async () => {
    const content = "google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0";
    vi.stubEnv("LEGACY_TRANSLATOR_ADS_TXT", content);
    const request = new Request("https://translator.whattypeof.com/ads.txt", {
      headers: { host: "translator.whattypeof.com" },
    });
    const response = await getLegacyAdsTxt(request);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(content + "\n");
    expect(response.headers.get("content-type")).toContain("text/plain");
  });

  it("rejects requests for another hostname in the legacy ads.txt handler", async () => {
    vi.stubEnv("LEGACY_TRANSLATOR_ADS_TXT", "seller-authorized");
    const request = new Request("https://example.org/ads.txt", {
      headers: { host: "example.org" },
    });
    const response = await getLegacyAdsTxt(request);
    expect(response.status).toBe(404);
  });
});
