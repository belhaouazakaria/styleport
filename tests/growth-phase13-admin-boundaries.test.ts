import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  guard: vi.fn(),
  session: vi.fn(),
  sameOrigin: vi.fn(),
  listReports: vi.fn(),
  getReport: vi.fn(),
  listWarnings: vi.fn(),
  transitionWarning: vi.fn(),
  inventory: vi.fn(),
  exposure: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireAdminRoute: mocks.requireAdmin }));
vi.mock("@/lib/permissions", () => ({
  adminRouteGuard: mocks.guard,
  getSessionOrNull: mocks.session,
}));
vi.mock("@/lib/growth/request-security", () => ({
  isSameOriginMutation: mocks.sameOrigin,
}));
vi.mock("@/lib/growth/reporting/admin", () => ({
  listArchivedGrowthReports: mocks.listReports,
  getArchivedGrowthReport: mocks.getReport,
}));
vi.mock("@/lib/growth/economics/warnings", () => ({
  listGrowthBudgetWarnings: mocks.listWarnings,
  transitionGrowthBudgetWarning: mocks.transitionWarning,
  GrowthBudgetWarningError: class GrowthBudgetWarningError extends Error {},
}));
vi.mock("@/lib/growth/economics/usage", () => ({
  getGrowthUsageInventory: mocks.inventory,
}));
vi.mock("@/lib/growth/economics/exposure", () => ({
  getGrowthBudgetExposure: mocks.exposure,
}));

import GrowthReportsPage from "@/app/(admin)/admin/growth/reports/page";
import GrowthReportDetailPage from "@/app/(admin)/admin/growth/reports/[reportId]/page";
import GrowthSpendPage from "@/app/(admin)/admin/growth/spend/page";
import GrowthWarningsPage from "@/app/(admin)/admin/growth/warnings/page";
import { POST as transition } from "@/app/api/admin/growth/warnings/transition/route";

const denied = new Error("ADMIN_ROUTE_DENIED");
function req(body: unknown) {
  return new Request("https://saytwist.com/api/admin/growth/warnings/transition", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("Phase 13 private admin and warning mutation boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockRejectedValue(denied);
    mocks.guard.mockResolvedValue(null);
    mocks.session.mockResolvedValue({ user: { id: "admin1", role: "ADMIN" } });
    mocks.sameOrigin.mockReturnValue(true);
  });

  it("rejects unauthenticated and non-admin report list, detail, spend and warning pages before any private read", async () => {
    await expect(GrowthReportsPage()).rejects.toBe(denied);
    await expect(GrowthReportDetailPage({ params: Promise.resolve({ reportId: "growth-20261024" }) }))
      .rejects.toBe(denied);
    await expect(GrowthSpendPage({ searchParams: Promise.resolve({ range: "30" }) }))
      .rejects.toBe(denied);
    await expect(GrowthWarningsPage()).rejects.toBe(denied);
    expect(mocks.listReports).not.toHaveBeenCalled();
    expect(mocks.getReport).not.toHaveBeenCalled();
    expect(mocks.listWarnings).not.toHaveBeenCalled();
    expect(mocks.inventory).not.toHaveBeenCalled();
    expect(mocks.exposure).not.toHaveBeenCalled();
  });

  it("honors the API permission response before parsing attacker payload or calling business services", async () => {
    const blocked = new Response("forbidden", { status: 403 });
    mocks.guard.mockResolvedValue(blocked);
    const response = await transition(req({ warningId: "warn1", transition: "ACKNOWLEDGE" }));
    expect(response).toBe(blocked);
    expect(mocks.sameOrigin).not.toHaveBeenCalled();
    expect(mocks.transitionWarning).not.toHaveBeenCalled();
  });

  it("rejects wrong origin, unknown fields and non-ADMIN sessions before touching audit state", async () => {
    mocks.sameOrigin.mockReturnValue(false);
    expect((await transition(req({ warningId: "warn1", transition: "ACKNOWLEDGE" }))).status).toBe(403);
    mocks.sameOrigin.mockReturnValue(true);
    expect((await transition(req({
      warningId: "warn1", transition: "ACKNOWLEDGE", costCents: 9999,
    }))).status).toBe(400);
    expect((await transition(req({
      warningId: "../unsafe", transition: "RESOLVE",
    }))).status).toBe(400);
    mocks.session.mockResolvedValue(null);
    expect((await transition(req({ warningId: "warn1", transition: "ACKNOWLEDGE" }))).status).toBe(401);
    expect(mocks.transitionWarning).not.toHaveBeenCalled();
  });

  it("allows only strict, actor-attributed warning transition without billing or report side effects", async () => {
    mocks.transitionWarning.mockResolvedValue({ state: "ACKNOWLEDGED", reused: false });
    const response = await transition(req({ warningId: "warn1", transition: "ACKNOWLEDGE" }));
    expect(response.status).toBe(200);
    expect(mocks.transitionWarning).toHaveBeenCalledExactlyOnceWith({
      warningId: "warn1", transition: "ACKNOWLEDGE", actorUserId: "admin1",
    });
    expect(mocks.getReport).not.toHaveBeenCalled();
    expect(mocks.listReports).not.toHaveBeenCalled();
    expect(mocks.exposure).not.toHaveBeenCalled();
  });
});
