import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn(), dashboard: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireAdminRoute: mocks.requireAdmin }));
vi.mock("@/lib/growth/pinterest/reporting", () => ({ getPinterestAnalyticsDashboard: mocks.dashboard }));
vi.mock("@/components/admin/admin-topbar", () => ({ AdminTopbar: ({ title }: { title: string }) => <h1>{title}</h1> }));
vi.mock("@/components/admin/growth-analytics-sync-button", () => ({ GrowthAnalyticsSyncButton: () => <button>Sync analytics</button> }));
vi.mock("@/components/admin/kpi-card", () => ({ KpiCard: ({ label }: { label: string }) => <div>{label}</div> }));

import GrowthAnalyticsPage from "@/app/(admin)/admin/growth/analytics/page";

describe("Growth Pinterest analytics admin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue({ user: { id: "admin", role: "ADMIN" } });
    mocks.dashboard.mockResolvedValue({
      accounts: [{ id: "account", username: "saytwist" }],
      selected: {
        id: "account", username: "saytwist",
        analyticsState: { status: "BACKFILLING", backfillPinsProcessed: 8, backfillPinsTotal: 137, lastSuccessfulSyncAt: null, lastError: null },
      },
      freshnessStatus: "BACKFILLING",
      totals: { impressions: 0n, saves: 0n, pinClicks: 0n, outboundClicks: 0n, engagements: 0n },
      trend: [], pins: [], pinCount: 720, analyticsRelevantPinCount: 137,
    });
  });

  it("separates whole-account totals from eligible detailed Pin progress", async () => {
    render(await GrowthAnalyticsPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByText("Inventoried Pins:")).toBeInTheDocument();
    expect(screen.getByText("720")).toBeInTheDocument();
    expect(screen.getByText("Analytics-relevant Pins:")).toBeInTheDocument();
    expect(screen.getByText("137")).toBeInTheDocument();
    expect(screen.getByText(/Detailed Pin backfill:/).closest("span")).toHaveTextContent("8 / 137");
    expect(screen.getByText(/Account totals cover the connected Pinterest account/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Owned-domain Pins ranked by outbound clicks" })).toBeInTheDocument();
  });
});
