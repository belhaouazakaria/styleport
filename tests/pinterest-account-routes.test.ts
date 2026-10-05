import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ guard: vi.fn(), session: vi.fn(), disconnect: vi.fn(), findAccount: vi.fn(), enqueue: vi.fn(), enqueueAnalytics: vi.fn() }));
vi.mock("@/lib/permissions", () => ({ adminRouteGuard: mocks.guard, getSessionOrNull: mocks.session }));
vi.mock("@/lib/growth/pinterest/accounts", () => ({
  disconnectPinterestAccount: mocks.disconnect,
  changePinterestAccountRole: vi.fn(),
  isUniqueConstraintError: () => false,
}));
vi.mock("@/lib/prisma", () => ({ prisma: { growthPinterestAccount: { findUnique: mocks.findAccount } } }));
vi.mock("@/lib/growth/pinterest/jobs", () => ({ enqueuePinterestSyncJobs: mocks.enqueue }));
vi.mock("@/lib/growth/pinterest/analytics", () => ({ enqueuePinterestAnalyticsSync: mocks.enqueueAnalytics }));

import { DELETE } from "@/app/api/admin/growth/pinterest/accounts/[id]/route";
import { POST as sync } from "@/app/api/admin/growth/pinterest/accounts/[id]/sync/route";
import { POST as syncAnalytics } from "@/app/api/admin/growth/pinterest/accounts/[id]/analytics/sync/route";

describe("Pinterest disconnect route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("APP_BASE_URL", "https://saytwist.com");
    mocks.guard.mockResolvedValue(null);
    mocks.session.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
    mocks.disconnect.mockResolvedValue({});
    mocks.findAccount.mockResolvedValue({ id: "account-1", connectionStatus: "CONNECTED" });
    mocks.enqueue.mockResolvedValue({ account: { created: true }, boards: { created: true } });
    mocks.enqueueAnalytics.mockResolvedValue({ account: { created: true }, inventory: { created: true }, range: { startDate: "2026-07-08", endDate: "2026-10-05" } });
  });
  afterEach(() => vi.unstubAllEnvs());

  it("requires admin authorization, same-origin headers, and deliberate confirmation", async () => {
    const context = { params: Promise.resolve({ id: "account-1" }) };
    mocks.guard.mockResolvedValueOnce(new Response("unauthorized", { status: 401 }));
    expect((await DELETE(new Request("https://saytwist.com/api/admin/growth/pinterest/accounts/account-1", { method: "DELETE" }), context)).status).toBe(401);
    expect((await DELETE(new Request("https://saytwist.com/api/admin/growth/pinterest/accounts/account-1", { method: "DELETE", headers: { origin: "https://evil.test", "sec-fetch-site": "cross-site" }, body: JSON.stringify({ confirm: true }) }), context)).status).toBe(403);
    expect((await DELETE(new Request("https://saytwist.com/api/admin/growth/pinterest/accounts/account-1", { method: "DELETE", headers: { origin: "https://saytwist.com", "sec-fetch-site": "same-origin" }, body: JSON.stringify({ confirm: false }) }), context)).status).toBe(400);
    const response = await DELETE(new Request("https://saytwist.com/api/admin/growth/pinterest/accounts/account-1", { method: "DELETE", headers: { origin: "https://saytwist.com", "sec-fetch-site": "same-origin" }, body: JSON.stringify({ confirm: true }) }), context);
    expect(response.status).toBe(200);
    expect(mocks.disconnect).toHaveBeenCalledWith("account-1", "admin-1");
  });

  it("allows an authenticated sync from the public origin through the reverse proxy", async () => {
    const context = { params: Promise.resolve({ id: "account-1" }) };
    const response = await sync(new Request("http://127.0.0.1:3001/api/admin/growth/pinterest/accounts/account-1/sync", {
      method: "POST", headers: { origin: "https://saytwist.com", "sec-fetch-site": "same-origin" },
    }), context);
    expect(response.status).toBe(200);
    expect(mocks.enqueue).toHaveBeenCalledWith("account-1");
  });

  it("rejects unauthorized sync requests before checking their origin", async () => {
    const context = { params: Promise.resolve({ id: "account-1" }) };
    mocks.guard.mockResolvedValueOnce(new Response("unauthorized", { status: 401 }));
    const response = await sync(new Request("http://127.0.0.1:3001/api/admin/growth/pinterest/accounts/account-1/sync", {
      method: "POST", headers: { origin: "https://evil.example", "sec-fetch-site": "cross-site" },
    }), context);
    expect(response.status).toBe(401);
    expect(mocks.findAccount).not.toHaveBeenCalled();
  });

  it("queues bounded analytics work only for an admin same-origin request", async () => {
    const context = { params: Promise.resolve({ id: "account-1" }) };
    const rejected = await syncAnalytics(new Request("https://saytwist.com/api/admin/growth/pinterest/accounts/account-1/analytics/sync", {
      method: "POST", headers: { origin: "https://evil.example", "sec-fetch-site": "cross-site" },
    }), context);
    expect(rejected.status).toBe(403);
    const accepted = await syncAnalytics(new Request("https://saytwist.com/api/admin/growth/pinterest/accounts/account-1/analytics/sync", {
      method: "POST", headers: { origin: "https://saytwist.com", "sec-fetch-site": "same-origin" },
    }), context);
    expect(accepted.status).toBe(200);
    expect(mocks.enqueueAnalytics).toHaveBeenCalledWith("account-1");
  });
});
