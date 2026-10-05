import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ guard: vi.fn(), session: vi.fn(), disconnect: vi.fn() }));
vi.mock("@/lib/permissions", () => ({ adminRouteGuard: mocks.guard, getSessionOrNull: mocks.session }));
vi.mock("@/lib/growth/pinterest/accounts", () => ({
  disconnectPinterestAccount: mocks.disconnect,
  changePinterestAccountRole: vi.fn(),
  isUniqueConstraintError: () => false,
}));

import { DELETE } from "@/app/api/admin/growth/pinterest/accounts/[id]/route";

describe("Pinterest disconnect route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.guard.mockResolvedValue(null);
    mocks.session.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
    mocks.disconnect.mockResolvedValue({});
  });

  it("requires admin authorization, same-origin headers, and deliberate confirmation", async () => {
    const context = { params: Promise.resolve({ id: "account-1" }) };
    mocks.guard.mockResolvedValueOnce(new Response("unauthorized", { status: 401 }));
    expect((await DELETE(new Request("https://saytwist.test/api/admin/growth/pinterest/accounts/account-1", { method: "DELETE" }), context)).status).toBe(401);
    expect((await DELETE(new Request("https://saytwist.test/api/admin/growth/pinterest/accounts/account-1", { method: "DELETE", headers: { origin: "https://evil.test", "sec-fetch-site": "cross-site" }, body: JSON.stringify({ confirm: true }) }), context)).status).toBe(403);
    expect((await DELETE(new Request("https://saytwist.test/api/admin/growth/pinterest/accounts/account-1", { method: "DELETE", headers: { origin: "https://saytwist.test", "sec-fetch-site": "same-origin" }, body: JSON.stringify({ confirm: false }) }), context)).status).toBe(400);
    const response = await DELETE(new Request("https://saytwist.test/api/admin/growth/pinterest/accounts/account-1", { method: "DELETE", headers: { origin: "https://saytwist.test", "sec-fetch-site": "same-origin" }, body: JSON.stringify({ confirm: true }) }), context);
    expect(response.status).toBe(200);
    expect(mocks.disconnect).toHaveBeenCalledWith("account-1", "admin-1");
  });
});
