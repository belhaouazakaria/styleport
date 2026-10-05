import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getToken: vi.fn() }));
vi.mock("@/lib/growth/pinterest/tokens", async () => ({ getValidPinterestAccessToken: mocks.getToken }));
vi.mock("@/lib/prisma", () => ({ prisma: { growthPinterestAccount: { updateMany: vi.fn() } } }));

import {
  fetchPinterestUserAccountWithToken,
  getPinterestAccountAnalytics,
  getPinterestBoardsPage,
  getPinterestPinAnalytics,
  getPinterestPinsPage,
  getPinterestTopPinsAnalytics,
  PinterestApiError,
} from "@/lib/growth/pinterest/api";
import { defaultRefreshRange } from "@/lib/growth/pinterest/analytics-contract";

const key = Buffer.alloc(32, 7).toString("base64");

describe("Pinterest API adapter", () => {
  beforeEach(() => {
    vi.stubEnv("PINTEREST_APP_ID", "app-id");
    vi.stubEnv("PINTEREST_APP_SECRET", "app-secret");
    vi.stubEnv("PINTEREST_REDIRECT_URI", "https://saytwist.test/api/admin/growth/pinterest/oauth/callback");
    vi.stubEnv("GROWTH_CREDENTIAL_ENCRYPTION_KEY", key);
    mocks.getToken.mockResolvedValue("test-access-token");
  });
  afterEach(() => vi.unstubAllEnvs());

  it.each([
    ["production", "https://api.pinterest.com/v5"],
    ["sandbox", "https://api-sandbox.pinterest.com/v5"],
  ])("uses the %s base and validates account JSON", async (environment, base) => {
    vi.stubEnv("PINTEREST_API_ENVIRONMENT", environment);
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "123", username: "saytwist", business_name: "SayTwist" }), {
      status: 200, headers: { "x-ratelimit-remaining": "99" },
    }));
    const result = await fetchPinterestUserAccountWithToken("test-access-token", fetchMock);
    expect(fetchMock).toHaveBeenCalledWith(`${base}/user_account`, expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer test-access-token" }), signal: expect.any(AbortSignal) }));
    expect(result.data.username).toBe("saytwist");
    expect(result.rateLimit.remaining).toBe("99");
  });

  it("passes bookmarks, rejects malformed success JSON, and classifies 429", async () => {
    vi.stubEnv("PINTEREST_API_ENVIRONMENT", "sandbox");
    const pageFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [], bookmark: "next" }), { status: 200 }));
    await getPinterestBoardsPage("account", "cursor value", pageFetch);
    expect(pageFetch.mock.calls[0][0]).toContain("bookmark=cursor+value");

    await expect(fetchPinterestUserAccountWithToken("token", vi.fn().mockResolvedValue(new Response(JSON.stringify({ wrong: true }), { status: 200 })))).rejects.toThrow("Pinterest user account response was invalid at id");
    await expect(fetchPinterestUserAccountWithToken("token", vi.fn().mockResolvedValue(new Response("not-json", { status: 200 })))).rejects.toThrow("Pinterest user account response was invalid at response");
    await expect(fetchPinterestUserAccountWithToken("token", vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 8 }), { status: 429, headers: { "retry-after": "12" } })))).rejects.toMatchObject<PinterestApiError>({ status: 429, retryable: true, retryAfterMs: 12_000 });
  });

  it.each([401, 403, 404, 500])("classifies HTTP %i without exposing response bodies", async (status) => {
    vi.stubEnv("PINTEREST_API_ENVIRONMENT", "production");
    const error = await fetchPinterestUserAccountWithToken("token", vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "Authorization: Bearer leaked" }), { status }))).catch((value) => value);
    expect(error).toMatchObject({ status, retryable: status >= 500 });
    expect(String(error.message)).not.toContain("leaked");
  });

  it("requests and validates account analytics with the centralized organic metric set", async () => {
    vi.stubEnv("PINTEREST_API_ENVIRONMENT", "production");
    const range = defaultRefreshRange();
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ all: { daily_metrics: [
      { date: range.endDate, data_status: "READY", metrics: { IMPRESSION: 100, SAVE: 4, PIN_CLICK: 9, OUTBOUND_CLICK: 3, ENGAGEMENT: 13 } },
    ], summary_metrics: { IMPRESSION: 100 } } }), { status: 200 }));
    const result = await getPinterestAccountAnalytics({ accountId: "account", ...range, fetchImpl: fetchMock });
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("/user_account/analytics?");
    expect(url).toContain("content_type=ORGANIC");
    expect(url).toContain("source=YOUR_PINS");
    expect(result.data.all.daily_metrics[0].metrics.OUTBOUND_CLICK).toBe(3);
  });

  it("requests top 50 Pins sorted by outbound clicks", async () => {
    vi.stubEnv("PINTEREST_API_ENVIRONMENT", "production");
    const range = defaultRefreshRange();
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      sort_by: "OUTBOUND_CLICK", pins: [{ pin_id: "123", metrics: { OUTBOUND_CLICK: 8, IMPRESSION: 80 } }],
    }), { status: 200 }));
    const result = await getPinterestTopPinsAnalytics({ accountId: "account", ...range, fetchImpl: fetchMock });
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("/user_account/analytics/top_pins?");
    expect(url).toContain("sort_by=OUTBOUND_CLICK");
    expect(url).toContain("num_of_pins=50");
    expect(result.data.pins[0].pin_id).toBe("123");
  });

  it("requests single-Pin daily analytics and never uses multiple-Pin analytics", async () => {
    vi.stubEnv("PINTEREST_API_ENVIRONMENT", "production");
    const range = defaultRefreshRange();
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ all: { daily_metrics: [] } }), { status: 200 }));
    await getPinterestPinAnalytics({ accountId: "account", pinterestPinId: "123", ...range, fetchImpl: fetchMock });
    expect(String(fetchMock.mock.calls[0][0])).toContain("/pins/123/analytics?");
    expect(String(fetchMock.mock.calls[0][0])).not.toContain("pins/analytics");
  });

  it("validates owned Pin inventory pages without requesting rolling summaries", async () => {
    vi.stubEnv("PINTEREST_API_ENVIRONMENT", "production");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [{ id: "123", title: "Pin", media: { media_type: "image", images: { "150x150": { url: "https://i.pinimg.com/x.jpg" } } } }], bookmark: null }), { status: 200 }));
    const result = await getPinterestPinsPage("account", "cursor", fetchMock);
    expect(String(fetchMock.mock.calls[0][0])).toContain("page_size=250");
    expect(String(fetchMock.mock.calls[0][0])).toContain("pin_metrics=false");
    expect(result.data.items[0].title).toBe("Pin");
  });

  it("reports safe Pin inventory issue paths without including response values", async () => {
    vi.stubEnv("PINTEREST_API_ENVIRONMENT", "production");
    const secretContent = "private-title-that-must-not-appear";
    const missingId = getPinterestPinsPage("account", undefined, vi.fn().mockResolvedValue(new Response(JSON.stringify({
      items: [{ title: secretContent, media: { media_type: "multiple_images", items: [] } }], bookmark: null,
    }), { status: 200 })));
    const error = await missingId.catch((value) => value);
    expect(error.message).toContain("Pinterest Pin inventory response was invalid at items.0.id (invalid_type)");
    expect(error.message).not.toContain(secretContent);
    expect(error.message.length).toBeLessThanOrEqual(500);

    await expect(getPinterestPinsPage("account", undefined, vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: "not-an-array" }), { status: 200 })))).rejects.toThrow("Pinterest Pin inventory response was invalid at items (invalid_type)");
  });

  it("rejects malformed analytics and classifies authenticated 401, 403, 429, and 5xx", async () => {
    vi.stubEnv("PINTEREST_API_ENVIRONMENT", "production");
    const range = defaultRefreshRange();
    await expect(getPinterestAccountAnalytics({ accountId: "account", ...range, fetchImpl: vi.fn().mockResolvedValue(new Response(JSON.stringify({ all: { daily_metrics: [{ date: "bad", data_status: "READY", metrics: {} }] } }), { status: 200 })) })).rejects.toThrow("Pinterest account analytics response was invalid at all.daily_metrics.0.date");
    await expect(getPinterestTopPinsAnalytics({ accountId: "account", ...range, fetchImpl: vi.fn().mockResolvedValue(new Response(JSON.stringify({ pins: "bad", sort_by: "OUTBOUND_CLICK" }), { status: 200 })) })).rejects.toThrow("Pinterest top Pins response was invalid at pins");
    await expect(getPinterestPinAnalytics({ accountId: "account", pinterestPinId: "123", ...range, fetchImpl: vi.fn().mockResolvedValue(new Response(JSON.stringify({ all: { daily_metrics: "bad" } }), { status: 200 })) })).rejects.toThrow("Pinterest Pin analytics response was invalid at all.daily_metrics");
    for (const status of [401, 403, 429, 500]) {
      const headers = status === 429 ? { "retry-after": "7" } : undefined;
      const error = await getPinterestAccountAnalytics({ accountId: "account", ...range, fetchImpl: vi.fn().mockResolvedValue(new Response("{}", { status, headers })) }).catch((value) => value);
      expect(String(error.message)).not.toContain("test-access-token");
      if (status === 429) expect(error).toMatchObject({ retryAfterMs: 7_000 });
    }
  });
});
