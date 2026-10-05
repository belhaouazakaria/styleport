import { GrowthPinterestApiEnvironment, GrowthPinterestPublicationRole } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ create: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn(), transaction: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: {
  growthPinterestOAuthState: { create: mocks.create },
  $transaction: mocks.transaction,
} }));

import { consumePinterestOAuthState, createPinterestOAuthState, exchangePinterestAuthorizationCode } from "@/lib/growth/pinterest/oauth";

describe("Pinterest OAuth primitives", () => {
  beforeEach(() => {
    vi.stubEnv("PINTEREST_APP_ID", "app-id");
    vi.stubEnv("PINTEREST_APP_SECRET", "app-secret");
    vi.stubEnv("PINTEREST_REDIRECT_URI", "https://saytwist.test/api/admin/growth/pinterest/oauth/callback");
    vi.stubEnv("PINTEREST_API_ENVIRONMENT", "sandbox");
    vi.stubEnv("GROWTH_CREDENTIAL_ENCRYPTION_KEY", Buffer.alloc(32, 1).toString("base64"));
    mocks.create.mockResolvedValue({});
    mocks.transaction.mockImplementation((callback: (tx: unknown) => unknown) => callback({ growthPinterestOAuthState: { findUnique: mocks.findUnique, updateMany: mocks.updateMany } }));
  });
  afterEach(() => vi.unstubAllEnvs());

  it("generates a hashed, expiring admin-bound state and exact OAuth URL", async () => {
    const result = await createPinterestOAuthState("admin-1", GrowthPinterestPublicationRole.SAYTWIST);
    expect(result.state).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(mocks.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      adminUserId: "admin-1", publicationRole: GrowthPinterestPublicationRole.SAYTWIST,
      apiEnvironment: GrowthPinterestApiEnvironment.SANDBOX, stateHash: expect.not.stringContaining(result.state),
    }) });
    const url = new URL(result.authorizationUrl);
    expect(`${url.origin}${url.pathname}`).toBe("https://www.pinterest.com/oauth/");
    expect(url.searchParams.get("scope")).toBe("user_accounts:read,boards:read,pins:read,pins:write");
    expect(url.searchParams.get("redirect_uri")).toBe("https://saytwist.test/api/admin/growth/pinterest/oauth/callback");
  });

  it("rejects mismatch, expiry, and replay while consuming a valid state once", async () => {
    const record = { id: "state-1", adminUserId: "admin-1", consumedAt: null, expiresAt: new Date(Date.now() + 60_000) };
    mocks.findUnique.mockResolvedValue(record);
    mocks.updateMany.mockResolvedValue({ count: 1 });
    await expect(consumePinterestOAuthState("state", "wrong-admin")).resolves.toBeNull();
    mocks.findUnique.mockResolvedValue({ ...record, expiresAt: new Date(Date.now() - 1) });
    await expect(consumePinterestOAuthState("state", "admin-1")).resolves.toBeNull();
    mocks.findUnique.mockResolvedValue({ ...record, consumedAt: new Date() });
    await expect(consumePinterestOAuthState("state", "admin-1")).resolves.toBeNull();
    mocks.findUnique.mockResolvedValue(record);
    await expect(consumePinterestOAuthState("state", "admin-1")).resolves.toEqual(record);
  });

  it("uses HTTP Basic token exchange and rejects malformed responses", async () => {
    const valid = { access_token: "test-access-new", refresh_token: "test-refresh-new", token_type: "bearer", expires_in: 3600, refresh_token_expires_in: 7200, scope: "boards:read" };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(valid), { status: 200 }));
    await expect(exchangePinterestAuthorizationCode("oauth-code", fetchMock)).resolves.toMatchObject(valid);
    expect(fetchMock).toHaveBeenCalledWith("https://api-sandbox.pinterest.com/v5/oauth/token", expect.objectContaining({
      method: "POST", headers: expect.objectContaining({ Authorization: expect.stringMatching(/^Basic /) }), signal: expect.any(AbortSignal),
    }));
    await expect(exchangePinterestAuthorizationCode("code", vi.fn().mockResolvedValue(new Response(JSON.stringify({ access_token: "only" }), { status: 200 })))).rejects.toThrow("invalid token response");
  });
});
