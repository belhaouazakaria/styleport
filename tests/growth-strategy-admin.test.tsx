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
vi.mock("@/lib/growth/strategy/reporting", () => ({
  getAccountStrategyDashboard: mocks.dashboard,
}));
vi.mock("@/lib/permissions", () => ({ adminRouteGuard: mocks.guard }));
vi.mock("@/lib/growth/strategy/review", () => ({
  enqueueAccountStrategyReview: mocks.enqueue,
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
      <span>{label}</span>
      <span>{value}</span>
    </div>
  ),
}));
vi.mock("@/components/admin/account-strategy-review-button", () => ({
  AccountStrategyReviewButton: () => (
    <button>Run account strategy review</button>
  ),
}));

import GrowthStrategyPage from "@/app/(admin)/admin/growth/strategy/page";
import { POST } from "@/app/api/admin/growth/strategy/reviews/route";

function metric(state: "KNOWN" | "NOT_APPLICABLE" = "KNOWN") {
  return state === "KNOWN"
    ? {
        state,
        observationDays: 28,
        impressions: "100",
        saves: "5",
        pinClicks: "4",
        outboundClicks: "3",
        outboundCtrPercent: 3,
      }
    : {
        state,
        observationDays: 0,
        impressions: null,
        saves: null,
        pinClicks: null,
        outboundClicks: null,
        outboundCtrPercent: null,
      };
}

const roles = [
  {
    role: "SAYTWIST",
    label: "SayTwist",
    intent: "UTILITY",
    purpose: "Main brand",
    accountId: "account",
    username: "saytwist",
    connectionStatus: "CONNECTED",
    health: "HEALTHY",
    readiness: "READY",
    evidenceQuality: "KNOWN",
    requiredScopesComplete: true,
    lastSuccessfulApiCallAt: null,
    lastAccountSyncAt: null,
    lastBoardSyncAt: null,
    analyticsStatus: "FRESH",
    lastAnalyticsSyncAt: null,
    activePins: 720,
    relevantPins: 221,
    boardCount: 18,
    metrics: metric(),
    attributionCollection: "NOT_COLLECTING",
    qualifiedConversions: null,
    qualifiedConversionEvidence: "NOT_APPLICABLE",
    alignment: {
      status: "ALIGNED",
      consideredPins: 221,
      alignedPins: 200,
      reasons: [],
    },
    reasonCodes: ["ATTRIBUTION_NOT_COLLECTING"],
    recommendedAction: "Keep measuring.",
  },
  {
    role: "SAYTWIST_IDEAS",
    label: "SayTwist Ideas",
    intent: "INSPIRATION",
    purpose: "Ideas",
    accountId: null,
    username: null,
    connectionStatus: null,
    health: "NOT_CONNECTED",
    readiness: "NOT_CONNECTED",
    evidenceQuality: "NOT_APPLICABLE",
    requiredScopesComplete: null,
    lastSuccessfulApiCallAt: null,
    lastAccountSyncAt: null,
    lastBoardSyncAt: null,
    analyticsStatus: null,
    lastAnalyticsSyncAt: null,
    activePins: null,
    relevantPins: null,
    boardCount: null,
    metrics: metric("NOT_APPLICABLE"),
    attributionCollection: "NOT_COLLECTING",
    qualifiedConversions: null,
    qualifiedConversionEvidence: "NOT_APPLICABLE",
    alignment: {
      status: "INSUFFICIENT_DATA",
      consideredPins: 0,
      alignedPins: 0,
      reasons: [],
    },
    reasonCodes: ["ROLE_NOT_CONNECTED"],
    recommendedAction: "Connect existing account.",
  },
  {
    role: "SAYTWIST_PLAYGROUND",
    label: "SayTwist Playground",
    intent: "PLAYGROUND",
    purpose: "Play",
    accountId: null,
    username: null,
    connectionStatus: null,
    health: "NOT_CONNECTED",
    readiness: "NOT_CONNECTED",
    evidenceQuality: "NOT_APPLICABLE",
    requiredScopesComplete: null,
    lastSuccessfulApiCallAt: null,
    lastAccountSyncAt: null,
    lastBoardSyncAt: null,
    analyticsStatus: null,
    lastAnalyticsSyncAt: null,
    activePins: null,
    relevantPins: null,
    boardCount: null,
    metrics: metric("NOT_APPLICABLE"),
    attributionCollection: "NOT_COLLECTING",
    qualifiedConversions: null,
    qualifiedConversionEvidence: "NOT_APPLICABLE",
    alignment: {
      status: "INSUFFICIENT_DATA",
      consideredPins: 0,
      alignedPins: 0,
      reasons: [],
    },
    reasonCodes: ["ROLE_NOT_CONNECTED"],
    recommendedAction: "Connect existing account.",
  },
];

describe("Growth account strategy admin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue({
      user: { id: "admin", role: "ADMIN" },
    });
    mocks.guard.mockResolvedValue(null);
    mocks.sameOrigin.mockReturnValue(true);
    mocks.enqueue.mockResolvedValue({ job: { id: "job" }, created: true });
    mocks.dashboard.mockResolvedValue({
      current: {
        modelVersion: "account_strategy_v1",
        evidenceWindowStart: "2026-09-08",
        evidenceWindowEnd: "2026-10-05",
        attributionCollection: "NOT_COLLECTING",
        roles,
        boards: [
          {
            accountRole: "SAYTWIST",
            accountUsername: "saytwist",
            pinterestBoardId: "board",
            name: "Text tools",
            privacy: "PUBLIC",
            active: true,
            pinCount: 20,
            relevantPinCount: 10,
            metrics: metric(),
            eligibility: "ELIGIBLE",
            reasonCodes: [],
            lastSyncedAt: "2026-10-05T00:00:00.000Z",
          },
        ],
        portfolio: {
          plannedRoles: 3,
          connectedRoles: 1,
          healthyRoles: 1,
          rolesNeedingAttention: 0,
          rolesWithoutEnoughData: 2,
          readiness: "PARTIAL",
          recommendation: "COMPLETE_BASELINE_PORTFOLIO",
          recommendedAccountCount: 3,
          confidence: 50,
          evidenceQuality: "INSUFFICIENT_DATA",
          reasonCodes: [
            "BASELINE_PORTFOLIO_INCOMPLETE",
            "ATTRIBUTION_NOT_COLLECTING",
          ],
          summary: "Complete baseline.",
        },
      },
      latestReview: null,
    });
  });

  it("requires ADMIN and renders all roles, disabled attribution, bounded boards, and no mutation controls", async () => {
    render(await GrowthStrategyPage());
    expect(mocks.requireAdmin).toHaveBeenCalledOnce();
    expect(
      screen.getByRole("heading", { name: "Pinterest account strategy" }),
    ).toBeInTheDocument();
    expect(screen.getByText("SayTwist")).toBeInTheDocument();
    expect(screen.getByText("SayTwist Ideas")).toBeInTheDocument();
    expect(screen.getByText("SayTwist Playground")).toBeInTheDocument();
    expect(screen.getByText(/QPC is unavailable/)).toBeInTheDocument();
    expect(screen.getByText("Text tools")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /create|delete|rename|publish/i }),
    ).not.toBeInTheDocument();
  });

  it("does not load strategy data when authorization fails", async () => {
    mocks.requireAdmin.mockRejectedValueOnce(new Error("redirect"));
    await expect(GrowthStrategyPage()).rejects.toThrow("redirect");
    expect(mocks.dashboard).not.toHaveBeenCalled();
  });

  it("guards the enqueue mutation with ADMIN authorization and same origin", async () => {
    const request = new Request(
      "https://saytwist.com/api/admin/growth/strategy/reviews",
      { method: "POST" },
    );
    const denied = new Response("denied", { status: 401 });
    mocks.guard.mockResolvedValueOnce(denied);
    expect(await POST(request)).toBe(denied);
    expect(mocks.enqueue).not.toHaveBeenCalled();

    mocks.guard.mockResolvedValueOnce(null);
    mocks.sameOrigin.mockReturnValueOnce(false);
    expect((await POST(request)).status).toBe(403);
    expect(mocks.enqueue).not.toHaveBeenCalled();

    mocks.guard.mockResolvedValueOnce(null);
    mocks.sameOrigin.mockReturnValueOnce(true);
    const response = await POST(request);
    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({
      ok: true,
      jobId: "job",
      created: true,
    });
  });
});
