import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getToken: vi.fn() }));
vi.mock("@/lib/growth/pinterest/tokens", async () => ({ getValidPinterestAccessToken: mocks.getToken }));
vi.mock("@/lib/prisma", () => ({ prisma: { growthPinterestAccount: { updateMany: vi.fn() } } }));

import { fetchPinterestUserAccountWithToken, getPinterestBoardsPage, PinterestApiError } from "@/lib/growth/pinterest/api";

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

    await expect(fetchPinterestUserAccountWithToken("token", vi.fn().mockResolvedValue(new Response(JSON.stringify({ wrong: true }), { status: 200 })))).rejects.toThrow("unexpected response shape");
    await expect(fetchPinterestUserAccountWithToken("token", vi.fn().mockResolvedValue(new Response("not-json", { status: 200 })))).rejects.toThrow("unexpected response shape");
    await expect(fetchPinterestUserAccountWithToken("token", vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 8 }), { status: 429, headers: { "retry-after": "12" } })))).rejects.toMatchObject<PinterestApiError>({ status: 429, retryable: true, retryAfterMs: 12_000 });
  });

  it.each([401, 403, 404, 500])("classifies HTTP %i without exposing response bodies", async (status) => {
    vi.stubEnv("PINTEREST_API_ENVIRONMENT", "production");
    const error = await fetchPinterestUserAccountWithToken("token", vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "Authorization: Bearer leaked" }), { status }))).catch((value) => value);
    expect(error).toMatchObject({ status, retryable: status >= 500 });
    expect(String(error.message)).not.toContain("leaked");
  });
});
