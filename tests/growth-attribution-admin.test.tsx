import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn(), dashboard: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireAdminRoute: mocks.requireAdmin }));
vi.mock("@/lib/growth/attribution/reporting", () => ({ getAttributionDashboard: mocks.dashboard }));
vi.mock("@/components/admin/admin-topbar", () => ({ AdminTopbar: ({ title }: { title: string }) => <h1>{title}</h1> }));
vi.mock("@/components/admin/kpi-card", () => ({ KpiCard: ({ label, value }: { label: string; value: string }) => <div><span>{label}</span><span>{value}</span></div> }));
vi.mock("@/components/admin/attribution-tools", () => ({ AttributionTools: () => <div>Attribution tools</div> }));

import GrowthAttributionPage from "@/app/(admin)/admin/growth/attribution/page";

describe("Growth attribution admin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue({ user: { id: "admin", role: "ADMIN" } });
    mocks.dashboard.mockResolvedValue({
      collection: { state: "DISABLED_BY_SERVER", environmentEnabled: false, settingEnabled: false, settings: { attributionWindowDays: 7, attributionSessionRetentionDays: 30, attributionEventRetentionDays: 90 } },
      modelVersion: "pinterest_organic_v1", rangeDays: 30, latestIngestAt: null,
      landingSessions: 12, attributedTranslations: 5, qualifiedConversions: 3, qualifiedConversionRate: 25,
      topDimensions: [], eligiblePins: [],
    });
  });

  it("requires admin and shows safe gate, aggregate, and coverage information", async () => {
    render(await GrowthAttributionPage({ searchParams: Promise.resolve({ range: "7" }) }));
    expect(mocks.requireAdmin).toHaveBeenCalledOnce();
    expect(mocks.dashboard).toHaveBeenCalledWith(7);
    expect(screen.getByRole("heading", { name: "SayTwist attribution" })).toBeInTheDocument();
    expect(screen.getByText(/disabled by server/i)).toBeInTheDocument();
    expect(screen.getByText("pinterest_organic_v1", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("Qualified conversions")).toBeInTheDocument();
    expect(screen.getByText(/Existing Pins created before Phase 5/)).toBeInTheDocument();
  });

  it("does not query dashboard when authorization fails", async () => {
    mocks.requireAdmin.mockRejectedValueOnce(new Error("redirect"));
    await expect(GrowthAttributionPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("redirect");
    expect(mocks.dashboard).not.toHaveBeenCalled();
  });
});
