import { describe, expect, it } from "vitest";

import { toSafeGrowthError, toSafeGrowthPayload } from "@/lib/growth/safe-data";

describe("Growth safe data", () => {
  it("removes sensitive structured fields recursively", () => {
    expect(toSafeGrowthPayload({
      safe: "kept",
      password: "hidden",
      nested: { refresh_token: "hidden", value: "kept" },
      headers: { Authorization: "Bearer hidden", Cookie: "session=hidden" },
    })).toEqual({ safe: "kept", nested: { value: "kept" }, headers: {} });
  });

  it.each([
    "postgresql://user:password@localhost:5432/database",
    "Authorization: Bearer secret-token",
    "Authorization=Basic encoded-secret",
    "Cookie: session=secret; Path=/",
    "Set-Cookie: refresh=secret; HttpOnly",
    "access_token=secret-value&safe=yes",
    "refresh_token: secret-value",
    "DATABASE_URL=postgresql://secret",
    "api-key: secret-value",
  ])("redacts credential-shaped error text: %s", (unsafe) => {
    const safe = toSafeGrowthError(new Error(`request failed ${unsafe}`));
    expect(safe).toContain("[redacted]");
    expect(safe).not.toMatch(/secret|password@|encoded-secret|session=secret/i);
  });
});
