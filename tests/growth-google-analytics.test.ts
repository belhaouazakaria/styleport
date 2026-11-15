// @vitest-environment node
import { generateKeyPairSync, verify } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  googleAnalyticsConfig,
  obtainGoogleAnalyticsToken,
  readGoogleDailyAnalytics,
  GoogleAnalyticsError,
} from "@/lib/growth/google/provider";
const credential = () => {
  const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return {
    keys,
    value: {
      type: "service_account",
      client_email: "growth@test-project.iam.gserviceaccount.com",
      private_key: keys.privateKey
        .export({ format: "pem", type: "pkcs8" })
        .toString(),
      token_uri: "https://oauth2.googleapis.com/token",
    },
  };
};
function gaResponse(rows: unknown[], overrides = {}) {
  return {
    dimensionHeaders: [{ name: "date" }],
    metricHeaders: ["sessions", "activeUsers", "keyEvents"].map((name) => ({
      name,
      type: "TYPE_INTEGER",
    })),
    rows,
    rowCount: rows.length,
    metadata: { timeZone: "America/New_York" },
    ...overrides,
  };
}
describe("Authorized Google read-only analytics", () => {
  it("is disabled without explicit opt-in and refuses arbitrary token endpoints/sites", () => {
    expect(() => googleAnalyticsConfig({})).toThrow("CONFIGURATION");
    const c = credential().value;
    expect(() =>
      googleAnalyticsConfig({
        GROWTH_GOOGLE_ANALYTICS_ENABLED: "true",
        GROWTH_GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({
          ...c,
          token_uri: "https://evil.example/token",
        }),
        GROWTH_GA4_PROPERTY_ID: "123",
      }),
    ).toThrow("CONFIGURATION");
    expect(() =>
      googleAnalyticsConfig({
        GROWTH_GOOGLE_ANALYTICS_ENABLED: "true",
        GROWTH_GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify(c),
        GROWTH_SEARCH_CONSOLE_SITE: "sc-domain:other.example",
      }),
    ).toThrow("CONFIGURATION");
  });
  it("signs a real short-lived JWT with only the requested read scope and no impersonation", async () => {
    const c = credential();
    const config = googleAnalyticsConfig({
      GROWTH_GOOGLE_ANALYTICS_ENABLED: "true",
      GROWTH_GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify(c.value),
      GROWTH_GA4_PROPERTY_ID: "123",
    });
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        Response.json({
          access_token: "fake-access",
          token_type: "Bearer",
          expires_in: 3600,
        }),
      );
    expect(await obtainGoogleAnalyticsToken(config, "GA4", fetcher)).toBe(
      "fake-access",
    );
    const assertion = new URLSearchParams(fetcher.mock.calls[0][1].body).get(
      "assertion",
    )!;
    const [header, payload, signature] = assertion.split(".");
    expect(
      verify(
        "RSA-SHA256",
        Buffer.from(header + "." + payload),
        c.keys.publicKey,
        Buffer.from(signature, "base64url"),
      ),
    ).toBe(true);
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
    expect(claims.scope).toBe(
      "https://www.googleapis.com/auth/analytics.readonly",
    );
    expect(claims.sub).toBeUndefined();
    expect(claims.exp - claims.iat).toBe(3600);
    expect(assertion).not.toContain(c.value.private_key);
  });
  it("preserves GA4 property dates and omitted dates without inventing zero metrics", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        Response.json(
          gaResponse([
            {
              dimensionValues: [{ value: "20261101" }],
              metricValues: [
                { value: "12" },
                { value: "10" },
                { value: "1.5" },
              ],
            },
          ]),
        ),
      );
    const result = await readGoogleDailyAnalytics(
      "GA4",
      "123",
      "2026-11-01",
      "2026-11-03",
      "fake",
      fetcher,
    );
    expect(result.rows).toHaveLength(1);
    expect(result.providerTimeZone).toBe("America/New_York");
    expect(result.rows[0]).toEqual({
      date: "2026-11-01",
      metrics: { sessions: "12", activeUsers: "10", keyEvents: "1.5" },
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("rejects GA4 row truncation, privacy thresholding and schema drift", async () => {
    const row = {
      dimensionValues: [{ value: "20261101" }],
      metricValues: [{ value: "1" }, { value: "1" }, { value: "1" }],
    };
    for (const body of [
      gaResponse([row], { rowCount: 2 }),
      gaResponse([row], {
        metadata: { timeZone: "UTC", subjectToThresholding: true },
      }),
      gaResponse([row], { metricHeaders: [{ name: "cost" }] }),
    ])
      await expect(
        readGoogleDailyAnalytics(
          "GA4",
          "123",
          "2026-11-01",
          "2026-11-03",
          "fake",
          vi.fn().mockResolvedValue(Response.json(body)),
        ),
      ).rejects.toThrow("INVALID_DATA");
  });
  it("requests finalized Search Console date-only data with Pacific date labels", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        Response.json({
          rows: [
            {
              keys: ["2026-11-01"],
              clicks: 5,
              impressions: 100,
              ctr: 0.05,
              position: 3.2,
            },
          ],
        }),
      );
    const result = await readGoogleDailyAnalytics(
      "SEARCH_CONSOLE",
      "sc-domain:saytwist.com",
      "2026-11-01",
      "2026-11-03",
      "fake",
      fetcher,
    );
    expect(result.providerTimeZone).toBe("America/Los_Angeles");
    expect(result.rows).toHaveLength(1);
    expect(JSON.parse(fetcher.mock.calls[0][1].body).dataState).toBe("final");
    expect(fetcher.mock.calls[0][0]).toContain("sc-domain%3Asaytwist.com");
  });
  it("rejects duplicate/out-of-range provider dates and classifies rate limits without leaking credentials", async () => {
    const row = {
      keys: ["2026-11-01"],
      clicks: 1,
      impressions: 10,
      ctr: 0.1,
      position: 1,
    };
    await expect(
      readGoogleDailyAnalytics(
        "SEARCH_CONSOLE",
        "sc-domain:saytwist.com",
        "2026-11-01",
        "2026-11-03",
        "fake",
        vi.fn().mockResolvedValue(Response.json({ rows: [row, row] })),
      ),
    ).rejects.toThrow("INVALID_DATA");
    await expect(
      readGoogleDailyAnalytics(
        "SEARCH_CONSOLE",
        "sc-domain:saytwist.com",
        "2026-11-02",
        "2026-11-03",
        "fake",
        vi.fn().mockResolvedValue(Response.json({ rows: [row] })),
      ),
    ).rejects.toThrow("INVALID_DATA");
    await expect(
      readGoogleDailyAnalytics(
        "GA4",
        "123",
        "2026-11-01",
        "2026-11-03",
        "secret",
        vi
          .fn()
          .mockResolvedValue(
            new Response("private provider body", {
              status: 429,
              headers: { "retry-after": "90" },
            }),
          ),
      ),
    ).rejects.toEqual(new GoogleAnalyticsError("RATE_LIMIT", 90000));
  });
});
