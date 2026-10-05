import { GrowthPinterestPublicationRole } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  guard: vi.fn(), session: vi.fn(), createState: vi.fn(), consumeState: vi.fn(), exchange: vi.fn(), fetchProfile: vi.fn(),
  connect: vi.fn(), enqueue: vi.fn(), activity: vi.fn(), unique: vi.fn(),
}));
vi.mock("@/lib/permissions", () => ({ adminRouteGuard: mocks.guard, getSessionOrNull: mocks.session }));
vi.mock("@/lib/growth/activity", () => ({ recordGrowthActivity: mocks.activity }));
vi.mock("@/lib/growth/pinterest/oauth", () => ({
  createPinterestOAuthState: mocks.createState, consumePinterestOAuthState: mocks.consumeState,
  exchangePinterestAuthorizationCode: mocks.exchange,
}));
vi.mock("@/lib/growth/pinterest/api", () => ({ fetchPinterestUserAccountWithToken: mocks.fetchProfile }));
vi.mock("@/lib/growth/pinterest/accounts", () => ({ connectPinterestAccount: mocks.connect, isUniqueConstraintError: mocks.unique }));
vi.mock("@/lib/growth/pinterest/jobs", () => ({ enqueuePinterestSyncJobs: mocks.enqueue }));
vi.mock("@/lib/growth/pinterest/config", async (original) => ({
  ...(await original<typeof import("@/lib/growth/pinterest/config")>()),
  requirePinterestConfiguration: () => ({ redirectUri: "https://saytwist.test/api/admin/growth/pinterest/oauth/callback" }),
}));

import { GET as callback } from "@/app/api/admin/growth/pinterest/oauth/callback/route";
import { GET as start } from "@/app/api/admin/growth/pinterest/oauth/start/route";

describe("Pinterest OAuth routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.guard.mockResolvedValue(null);
    mocks.session.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
    mocks.activity.mockResolvedValue({});
    mocks.createState.mockResolvedValue({ state: "secret-state", expiresAt: new Date(), authorizationUrl: "https://www.pinterest.com/oauth/?state=secret-state" });
  });

  it("rejects unauthenticated/non-admin starts through the existing guard", async () => {
    mocks.guard.mockResolvedValueOnce(new Response("unauthorized", { status: 401 })).mockResolvedValueOnce(new Response("forbidden", { status: 403 }));
    expect((await start(new Request("https://saytwist.test/api/admin/growth/pinterest/oauth/start?role=SAYTWIST"))).status).toBe(401);
    expect((await start(new Request("https://saytwist.test/api/admin/growth/pinterest/oauth/start?role=SAYTWIST"))).status).toBe(403);
    expect(mocks.createState).not.toHaveBeenCalled();
  });

  it("rejects an invalid role and redirects a valid start to Pinterest", async () => {
    expect((await start(new Request("https://saytwist.test/api/admin/growth/pinterest/oauth/start?role=WRONG"))).status).toBe(400);
    const response = await start(new Request("https://saytwist.test/api/admin/growth/pinterest/oauth/start?role=SAYTWIST"));
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://www.pinterest.com/oauth/?state=secret-state");
    expect(mocks.createState).toHaveBeenCalledWith("admin-1", GrowthPinterestPublicationRole.SAYTWIST);
  });

  it("rejects missing, mismatched, expired, or replayed callback state", async () => {
    expect((await callback(new Request("https://saytwist.test/api/admin/growth/pinterest/oauth/callback"))).headers.get("location")).toContain("status=invalid_state");
    mocks.consumeState.mockResolvedValue(null);
    for (const state of ["mismatch", "expired", "replayed"]) {
      const response = await callback(new Request(`https://saytwist.test/api/admin/growth/pinterest/oauth/callback?state=${state}&code=code`));
      expect(response.headers.get("location")).toContain("status=invalid_state");
    }
    expect(mocks.exchange).not.toHaveBeenCalled();
  });

  it("handles denial and missing code without exchanging credentials", async () => {
    mocks.consumeState.mockResolvedValue({ publicationRole: GrowthPinterestPublicationRole.SAYTWIST });
    expect((await callback(new Request("https://saytwist.test/api/admin/growth/pinterest/oauth/callback?state=s&error=access_denied"))).headers.get("location")).toContain("status=denied");
    expect((await callback(new Request("https://saytwist.test/api/admin/growth/pinterest/oauth/callback?state=s"))).headers.get("location")).toContain("status=missing_code");
    expect(mocks.exchange).not.toHaveBeenCalled();
  });

  it("connects only after token and user-account success, then uses a fixed internal redirect", async () => {
    mocks.consumeState.mockResolvedValue({ publicationRole: GrowthPinterestPublicationRole.SAYTWIST });
    mocks.exchange.mockResolvedValue({ access_token: "secret", refresh_token: "secret2" });
    mocks.fetchProfile.mockResolvedValue({ data: { id: "pin-1", username: "saytwist" } });
    mocks.connect.mockResolvedValue({ id: "account-1" });
    mocks.enqueue.mockResolvedValue({});
    const response = await callback(new Request("https://attacker.test/api/admin/growth/pinterest/oauth/callback?state=s&code=oauth-secret"));
    expect(response.headers.get("location")).toBe("https://saytwist.test/admin/growth/accounts?status=connected");
    expect(response.headers.get("location")).not.toContain("oauth-secret");
    expect(mocks.fetchProfile).toHaveBeenCalledWith("secret");
    expect(mocks.enqueue).toHaveBeenCalledWith("account-1");
  });

  it("returns a fixed non-sensitive conflict result for a duplicate role or account", async () => {
    mocks.consumeState.mockResolvedValue({ publicationRole: GrowthPinterestPublicationRole.SAYTWIST });
    mocks.exchange.mockResolvedValue({ access_token: "test-access", refresh_token: "test-refresh" });
    mocks.fetchProfile.mockResolvedValue({ data: { id: "pin-1", username: "saytwist" } });
    mocks.connect.mockRejectedValue({ code: "P2002", message: "credential details must stay hidden" });
    mocks.unique.mockReturnValue(true);
    const response = await callback(new Request("https://saytwist.test/api/admin/growth/pinterest/oauth/callback?state=s&code=private-code"));
    expect(response.headers.get("location")).toBe("https://saytwist.test/admin/growth/accounts?status=role_or_account_conflict");
  });
});
