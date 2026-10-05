import { describe, expect, it } from "vitest";

import { growthSettingsSchema } from "@/lib/growth/contracts";
import { isSameOriginMutation } from "@/lib/growth/request-security";
import { toSafeGrowthError, toSafeGrowthPayload } from "@/lib/growth/safe-data";

describe("Growth foundation contracts", () => {
  it("accepts only bounded, explicit settings", () => {
    expect(growthSettingsSchema.parse({ enabled: false, intensity: "BALANCED", workerBatchSize: 5 })).toEqual({
      enabled: false,
      intensity: "BALANCED",
      workerBatchSize: 5,
    });
    expect(growthSettingsSchema.safeParse({ enabled: true, intensity: "BALANCED", workerBatchSize: 0 }).success).toBe(false);
    expect(growthSettingsSchema.safeParse({ enabled: true, intensity: "BALANCED", workerBatchSize: 5, token: "secret" }).success).toBe(false);
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

  it("requires same-origin headers for settings mutations", () => {
    expect(isSameOriginMutation(new Request("https://saytwist.com/api/admin/growth/settings", { headers: { origin: "https://saytwist.com", "sec-fetch-site": "same-origin" } }))).toBe(true);
    expect(isSameOriginMutation(new Request("https://saytwist.com/api/admin/growth/settings", { headers: { origin: "https://example.com", "sec-fetch-site": "cross-site" } }))).toBe(false);
    expect(isSameOriginMutation(new Request("https://saytwist.com/api/admin/growth/settings"))).toBe(false);
  });
});
