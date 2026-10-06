import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { growthSettingsSchema } from "@/lib/growth/contracts";
import { isSameOriginMutation } from "@/lib/growth/request-security";
import { toSafeGrowthError, toSafeGrowthPayload } from "@/lib/growth/safe-data";

describe("Growth foundation contracts", () => {
  beforeEach(() => vi.stubEnv("APP_BASE_URL", "https://saytwist.com"));
  afterEach(() => vi.unstubAllEnvs());

  it("accepts only bounded, explicit settings", () => {
    expect(growthSettingsSchema.parse({ enabled: false, intensity: "BALANCED", workerBatchSize: 5, ownedDomains: [" SAYTWIST.COM "] })).toEqual({
      enabled: false,
      intensity: "BALANCED",
      workerBatchSize: 5,
      ownedDomains: ["saytwist.com"],
      attributionEnabled: false,
      attributionWindowDays: 7,
      attributionSessionRetentionDays: 30,
      attributionEventRetentionDays: 90,
    });
    expect(growthSettingsSchema.safeParse({ enabled: true, intensity: "BALANCED", workerBatchSize: 0, ownedDomains: ["saytwist.com"] }).success).toBe(false);
    expect(growthSettingsSchema.safeParse({ enabled: true, intensity: "BALANCED", workerBatchSize: 5, ownedDomains: ["saytwist.com"], token: "secret" }).success).toBe(false);
  });

  it("removes sensitive fields and bounds structured payloads", () => {
    expect(toSafeGrowthPayload({ task: "noop", apiKey: "do-not-store", nested: { token: "hidden", safe: true } })).toEqual({
      task: "noop",
      nested: { safe: true },
    });
    expect(() => toSafeGrowthPayload({ value: "x".repeat(9_000) })).toThrow("exceeds");
  });

  it("sanitizes credential-like values from persisted errors", () => {
    const result = toSafeGrowthError("failed postgresql://user:pass@host/db token=abc123");
    expect(result).not.toContain("user:pass");
    expect(result).not.toContain("abc123");
  });

  it("compares mutation origins with the configured public URL, not the reverse-proxy listener", () => {
    const internalUrl = "http://127.0.0.1:3001/api/admin/growth/settings";
    expect(isSameOriginMutation(new Request(internalUrl, { headers: { origin: "https://saytwist.com", "sec-fetch-site": "same-origin" } }))).toBe(true);
    expect(isSameOriginMutation(new Request(internalUrl, { headers: { origin: "https://evil.example", "sec-fetch-site": "same-origin" } }))).toBe(false);
    expect(isSameOriginMutation(new Request(internalUrl, { headers: { origin: "http://saytwist.com", "sec-fetch-site": "same-origin" } }))).toBe(false);
    expect(isSameOriginMutation(new Request(internalUrl, { headers: { origin: "https://saytwist.com.evil.example", "sec-fetch-site": "same-origin" } }))).toBe(false);
    expect(isSameOriginMutation(new Request(internalUrl, { headers: { origin: "not a valid origin", "sec-fetch-site": "same-origin" } }))).toBe(false);
    expect(isSameOriginMutation(new Request(internalUrl))).toBe(false);
  });
});
