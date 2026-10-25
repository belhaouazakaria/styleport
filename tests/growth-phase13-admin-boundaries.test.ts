import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  guard: vi.fn(), session: vi.fn(), sameOrigin: vi.fn(), transitionWarning: vi.fn(),
}));

// Test the API handler dynamically, and inspect page source boundaries without
// importing Next.js page bundles into Vitest's Node environment. next-auth
// internals require Next's own module resolution and are not a valid route test.
vi.mock("@/lib/permissions", () => ({
  adminRouteGuard: mocks.guard,
  getSessionOrNull: mocks.session,
}));
vi.mock("@/lib/growth/request-security", () => ({
  isSameOriginMutation: mocks.sameOrigin,
}));
vi.mock("@/lib/growth/economics/warnings", () => ({
  transitionGrowthBudgetWarning: mocks.transitionWarning,
  GrowthBudgetWarningError: class GrowthBudgetWarningError extends Error {},
}));

import { POST as transition } from "@/app/api/admin/growth/warnings/transition/route";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}
function req(body: unknown) {
  return new Request("https://saytwist.com/api/admin/growth/warnings/transition", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("Phase 13 report/warning read and API authentication boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.guard.mockResolvedValue(null);
    mocks.session.mockResolvedValue({ user: { id: "admin1", role: "ADMIN" } });
    mocks.sameOrigin.mockReturnValue(true);
  });

  it("keeps each private page dynamic and statically checks ADMIN before the first reader call", () => {
    for (const [path, readCall] of [
      ["app/(admin)/admin/growth/reports/page.tsx", "await listArchivedGrowthReports()"],
      ["app/(admin)/admin/growth/reports/[reportId]/page.tsx", "await getArchivedGrowthReport(reportId)"],
      ["app/(admin)/admin/growth/warnings/page.tsx", "await listGrowthBudgetWarnings()"],
      ["app/(admin)/admin/growth/spend/page.tsx", "getGrowthUsageInventory(days)"],
    ]) {
      const contents = source(path);
      const guard = contents.indexOf("await requireAdminRoute()");
      const read = contents.indexOf(readCall);
      expect(guard, path).toBeGreaterThan(-1);
      expect(read, path).toBeGreaterThan(guard);
      expect(contents).toContain('export const dynamic = "force-dynamic"');
      expect(contents, path).not.toMatch(/submitTelegramDailyReport\(|submitArchivedDailyReport\(/);
    }
  });

  it("honors permission guard before parsing request or calling warning service", async () => {
    const blocked = new Response("forbidden", { status: 403 });
    mocks.guard.mockResolvedValue(blocked);
    expect(await transition(req({ warningId: "warn1", transition: "ACKNOWLEDGE" }))).toBe(blocked);
    expect(mocks.sameOrigin).not.toHaveBeenCalled();
    expect(mocks.transitionWarning).not.toHaveBeenCalled();
  });

  it("rejects cross-origin, mass assignment, malformed IDs and missing session", async () => {
    mocks.sameOrigin.mockReturnValue(false);
    expect((await transition(req({ warningId: "warn1", transition: "ACKNOWLEDGE" }))).status).toBe(403);
    mocks.sameOrigin.mockReturnValue(true);
    expect((await transition(req({
      warningId: "warn1", transition: "ACKNOWLEDGE", actualCostCents: 1000,
    }))).status).toBe(400);
    expect((await transition(req({ warningId: "../bad", transition: "RESOLVE" }))).status).toBe(400);
    mocks.session.mockResolvedValue(null);
    expect((await transition(req({ warningId: "warn1", transition: "ACKNOWLEDGE" }))).status).toBe(401);
    expect(mocks.transitionWarning).not.toHaveBeenCalled();
  });

  it("accepts only strict actor-attributed warning transitions, with no billing/report side effects", async () => {
    mocks.transitionWarning.mockResolvedValue({ state: "ACKNOWLEDGED", reused: false });
    const response = await transition(req({ warningId: "warn1", transition: "ACKNOWLEDGE" }));
    expect(response.status).toBe(200);
    expect(mocks.transitionWarning).toHaveBeenCalledExactlyOnceWith({
      warningId: "warn1", transition: "ACKNOWLEDGE", actorUserId: "admin1",
    });
  });
});
