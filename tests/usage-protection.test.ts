import { describe, expect, it } from "vitest";

import { getUtcDayWindow } from "@/lib/usage-protection";
import { extractClientIp, hashIp } from "@/lib/utils";

describe("usage protection helpers", () => {
  it("computes UTC day boundaries correctly", () => {
    const reference = new Date("2026-04-20T23:59:59.000Z");
    const { start, endExclusive } = getUtcDayWindow(reference);

    expect(start.toISOString()).toBe("2026-04-20T00:00:00.000Z");
    expect(endExclusive.toISOString()).toBe("2026-04-21T00:00:00.000Z");
  });

  it("extracts proxy-forwarded IP when TRUST_PROXY_HEADERS is enabled", () => {
    process.env.TRUST_PROXY_HEADERS = "true";
    const request = new Request("http://localhost/api/translate", {
      headers: {
        "x-forwarded-for": "203.0.113.9, 10.0.0.4",
      },
    });

    expect(extractClientIp(request)).toBe("203.0.113.9");
  });

  it("ignores forwarded header when TRUST_PROXY_HEADERS is disabled", () => {
    process.env.TRUST_PROXY_HEADERS = "false";
    const request = new Request("http://localhost/api/translate", {
      headers: {
        "x-forwarded-for": "203.0.113.9",
        "x-real-ip": "198.51.100.8",
      },
    });

    expect(extractClientIp(request)).toBe("198.51.100.8");
  });

  it("hashIp is stable with same secret and changes with different secret", () => {
    process.env.IP_HASH_SECRET = "one-secret";
    const first = hashIp("203.0.113.9");
    const second = hashIp("203.0.113.9");

    process.env.IP_HASH_SECRET = "another-secret";
    const third = hashIp("203.0.113.9");

    expect(first).toBe(second);
    expect(first).not.toBe(third);
  });
});
