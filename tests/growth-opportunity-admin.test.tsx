import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  dashboard: vi.fn(),
  guard: vi.fn(),
  enqueue: vi.fn(),
  sameOrigin: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ requireAdminRoute: mocks.requireAdmin }));
vi.mock("@/lib/growth/opportunity/reporting", () => ({
  getOpportunityDashboard: mocks.dashboard,
}));
vi.mock("@/lib/permissions", () => ({ adminRouteGuard: mocks.guard }));
vi.mock("@/lib/growth/opportunity/analysis", () => ({
  enqueueOpportunityAnalysis: mocks.enqueue,
}));
vi.mock("@/lib/growth/request-security", () => ({
  isSameOriginMutation: mocks.sameOrigin,
}));
vi.mock("@/components/admin/admin-topbar", () => ({
  AdminTopbar: ({ title }: { title: string }) => <h1>{title}</h1>,
}));
vi.mock("@/components/admin/kpi-card", () => ({
  KpiCard: ({ label, value }: { label: string; value: string }) => (
    <div>
      {label}: {value}
    </div>
  ),
}));
vi.mock("@/components/admin/opportunity-analysis-button", () => ({
  OpportunityAnalysisButton: () => <button>Queue opportunity analysis</button>,
}));
import Page from "@/app/(admin)/admin/growth/opportunities/page";
import { POST } from "@/app/api/admin/growth/opportunities/analyses/route";
describe("Phase 7 opportunity admin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue({ user: { role: "ADMIN" } });
    mocks.guard.mockResolvedValue(null);
    mocks.sameOrigin.mockReturnValue(true);
    mocks.enqueue.mockResolvedValue({ job: { id: "job" }, created: true });
    mocks.dashboard.mockResolvedValue({
      latestRun: {
        intelligenceModelVersion: "opportunity_intelligence_v2",
        clusteringModelVersion: "content_clustering_v2",
        scoringModelVersion: "opportunity_scoring_v1",
        evidenceQuality: "KNOWN",
        pinsConsidered: 12,
        pinCap: 500,
        clustersProduced: 2,
        opportunitiesProduced: 1,
        attributionCollection: "NOT_COLLECTING",
        evidenceWindowStart: new Date("2026-09-08Z"),
        evidenceWindowEnd: new Date("2026-10-05Z"),
      },
      pinSignals: [
        {
          id: "s",
          type: "WINNER",
          strength: "STRONG",
          confidence: 85,
          pinterestPinId: "pin",
          pin: { title: "Strong Pin" },
          cluster: { name: "slang" },
        },
      ],
      opportunities: [
        {
          id: "o",
          type: "AMPLIFY_WINNER",
          score: 80,
          confidence: 90,
          status: "OPEN",
          cluster: { name: "slang" },
        },
      ],
      clusters: [],
    });
  });
  it("renders bounded local evidence and unavailable attribution", async () => {
    render(await Page());
    expect(
      screen.getByRole("heading", { name: "Growth opportunities" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/not collecting/i)).toBeInTheDocument();
    expect(screen.getByText(/amplify winner/i)).toBeInTheDocument();
    expect(
      screen.getByText(/opportunity_intelligence_v2/i),
    ).toBeInTheDocument();
  });
  it("preserves the admin guard", async () => {
    const denied = new Response("denied", { status: 403 });
    mocks.guard.mockResolvedValueOnce(denied);
    expect(
      await POST(
        new Request(
          "https://saytwist.com/api/admin/growth/opportunities/analyses",
          { method: "POST" },
        ),
      ),
    ).toBe(denied);
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });
  it("rejects cross-origin enqueue", async () => {
    mocks.sameOrigin.mockReturnValue(false);
    expect(
      (
        await POST(
          new Request(
            "https://saytwist.com/api/admin/growth/opportunities/analyses",
            { method: "POST" },
          ),
        )
      ).status,
    ).toBe(403);
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });
  it("enqueues one daily analysis", async () => {
    expect(
      (
        await POST(
          new Request(
            "https://saytwist.com/api/admin/growth/opportunities/analyses",
            { method: "POST" },
          ),
        )
      ).status,
    ).toBe(202);
    expect(mocks.enqueue).toHaveBeenCalledOnce();
  });
});
