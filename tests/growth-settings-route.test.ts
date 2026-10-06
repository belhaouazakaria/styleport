import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  guard: vi.fn(),
  session: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/lib/permissions", () => ({
  adminRouteGuard: mocks.guard,
  getSessionOrNull: mocks.session,
}));
vi.mock("@/lib/growth/settings", () => ({ updateGrowthSettings: mocks.update }));
vi.mock("@/lib/api-response", () => ({
  apiOk: (payload: unknown, status = 200) => Response.json({ ok: true, ...(payload as object) }, { status }),
  apiError: (status: number, code: string, message: string) => Response.json({ ok: false, error: { code, message } }, { status }),
}));

import { PUT } from "@/app/api/admin/growth/settings/route";

function request(body: unknown, origin = "https://saytwist.com") {
  return new Request("http://127.0.0.1:3001/api/admin/growth/settings", {
    method: "PUT",
    headers: { "content-type": "application/json", origin, "sec-fetch-site": origin === "https://saytwist.com" ? "same-origin" : "cross-site" },
    body: JSON.stringify(body),
  });
}

describe("Growth settings API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("APP_BASE_URL", "https://saytwist.com");
    mocks.guard.mockResolvedValue(null);
    mocks.session.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
    mocks.update.mockImplementation(async (input) => ({ id: "global", ...input, configVersion: 2 }));
  });
  afterEach(() => vi.unstubAllEnvs());

  it("preserves the existing admin authorization response", async () => {
    const denied = new Response("denied", { status: 403 });
    mocks.guard.mockResolvedValueOnce(denied);
    expect(await PUT(request({ enabled: false, intensity: "BALANCED", workerBatchSize: 5, ownedDomains: ["saytwist.com"] }))).toBe(denied);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("rejects cross-origin mutation", async () => {
    const response = await PUT(request({ enabled: false, intensity: "BALANCED", workerBatchSize: 5, ownedDomains: ["saytwist.com"] }, "https://attacker.example"));
    expect(response.status).toBe(403);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("rejects invalid or mass-assigned settings", async () => {
    const response = await PUT(request({ enabled: true, intensity: "BALANCED", workerBatchSize: 5, ownedDomains: ["saytwist.com"], maxSpend: 999 }));
    expect(response.status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("updates settings for an authenticated admin through the reverse-proxy listener", async () => {
    const payload = { enabled: true, intensity: "LOW", workerBatchSize: 3, ownedDomains: [" SAYTWIST.COM ", "translator.whattypeof.com"] };
    const response = await PUT(request(payload));
    expect(response.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith({ ...payload, ownedDomains: ["saytwist.com", "translator.whattypeof.com"] }, "admin-1");
  });
});
