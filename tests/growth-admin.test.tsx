import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  guard: vi.fn(),
  overview: vi.fn(),
  requireAdmin: vi.fn(),
}));

vi.mock("@/lib/permissions", () => ({ adminRouteGuard: mocks.guard }));
vi.mock("@/lib/auth", () => ({ requireAdminRoute: mocks.requireAdmin }));
vi.mock("@/lib/growth/admin", () => ({ getGrowthFoundationOverview: mocks.overview }));
vi.mock("@/lib/api-response", () => ({ apiOk: (payload: unknown) => Response.json({ ok: true, ...(payload as object) }) }));
vi.mock("@/components/admin/admin-topbar", () => ({ AdminTopbar: ({ title }: { title: string }) => <h1>{title}</h1> }));
vi.mock("@/components/admin/growth-settings-form", () => ({ GrowthSettingsForm: () => <div>Growth settings form</div> }));
vi.mock("@/components/admin/kpi-card", () => ({ KpiCard: ({ label, value }: { label: string; value: string | number }) => <div><span>{label}</span><span>{value}</span></div> }));

import AdminGrowthPage from "@/app/(admin)/admin/growth/page";
import { GET } from "@/app/api/admin/growth/route";

const overview = {
  settings: { enabled: false, intensity: "BALANCED" as const, workerBatchSize: 5, ownedDomains: ["saytwist.com"], attributionEnabled: false, attributionWindowDays: 7, attributionSessionRetentionDays: 30, attributionEventRetentionDays: 90, configVersion: 1 },
  jobs: { queued: 2, claimed: 1, running: 0, retryable: 1, terminalFailed: 0, succeeded: 3, cancelled: 0, oldestRunnableJob: null },
  recentActivity: [],
  worker: null,
  pinterestAnalytics: { pinsInventoried: 0, analyticsRelevantPins: 0, status: "NEVER_SYNCED", lastSuccessfulSyncAt: null, backfillPinsProcessed: 0, backfillPinsTotal: 0 },
  attribution: { state: "DISABLED_BY_SERVER", environmentEnabled: false, settingEnabled: false },
};

describe("Growth admin foundation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the existing admin guard response for unauthorized requests", async () => {
    const denied = new Response("denied", { status: 401 });
    mocks.guard.mockResolvedValueOnce(denied);
    expect(await GET()).toBe(denied);
    expect(mocks.overview).not.toHaveBeenCalled();
  });

  it("renders actual foundation values without fake metrics", async () => {
    mocks.requireAdmin.mockResolvedValueOnce({ user: { id: "admin-1", role: "ADMIN" } });
    mocks.overview.mockResolvedValueOnce(overview);
    render(await AdminGrowthPage());
    expect(mocks.requireAdmin).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("heading", { name: "Growth" })).toBeInTheDocument();
    expect(screen.getByText("Disabled")).toBeInTheDocument();
    expect(screen.getByText("Queued jobs")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.queryByText(/outbound clicks/i)).not.toBeInTheDocument();
  });

  it("does not load foundation data when page authorization fails", async () => {
    mocks.requireAdmin.mockRejectedValueOnce(new Error("redirect"));
    await expect(AdminGrowthPage()).rejects.toThrow("redirect");
    expect(mocks.overview).not.toHaveBeenCalled();
  });
});
