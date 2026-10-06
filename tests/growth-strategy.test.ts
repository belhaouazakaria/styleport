import {
  GrowthPinterestAnalyticsStatus,
  GrowthPinterestConnectionStatus,
  GrowthPinterestPublicationRole,
  GrowthStrategyEvidenceQuality,
} from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  evaluateAccountHealth,
  evaluateIntentAlignment,
  type StrategyAccountInput,
} from "@/lib/growth/strategy/account-health";
import { evaluateBoardEligibility } from "@/lib/growth/strategy/boards";
import {
  ACCOUNT_STRATEGY_MODEL_VERSION,
  accountStrategyReviewWindow,
} from "@/lib/growth/strategy/constants";
import {
  accountStrategyEvidenceSchema,
  type RoleStrategy,
} from "@/lib/growth/strategy/contracts";
import {
  concentrationForRole,
  evaluatePortfolio,
} from "@/lib/growth/strategy/portfolio";

const now = new Date("2026-10-06T12:00:00.000Z");

function healthyAccount(
  overrides: Partial<StrategyAccountInput> = {},
): StrategyAccountInput {
  return {
    id: "account",
    activeRole: GrowthPinterestPublicationRole.SAYTWIST,
    username: "saytwist",
    connectionStatus: GrowthPinterestConnectionStatus.CONNECTED,
    grantedScopes: [
      "boards:read",
      "pins:read",
      "pins:write",
      "user_accounts:read",
    ],
    refreshTokenExpiresAt: new Date("2027-01-01T00:00:00Z"),
    lastSuccessfulApiCallAt: now,
    lastAccountSyncAt: now,
    lastBoardSyncAt: now,
    analyticsStatus: GrowthPinterestAnalyticsStatus.FRESH,
    lastAnalyticsSyncAt: now,
    activePins: 20,
    relevantPins: 10,
    boardCount: 3,
    observationDays: 28,
    ...overrides,
  };
}

function role(
  role: GrowthPinterestPublicationRole,
  overrides: Partial<RoleStrategy> = {},
): RoleStrategy {
  return {
    role,
    label: role,
    intent:
      role === GrowthPinterestPublicationRole.SAYTWIST
        ? "UTILITY"
        : role === GrowthPinterestPublicationRole.SAYTWIST_IDEAS
          ? "INSPIRATION"
          : "PLAYGROUND",
    purpose: "Purpose",
    accountId: `account-${role}`,
    username: role.toLowerCase(),
    connectionStatus: "CONNECTED",
    health: "HEALTHY",
    readiness: "READY",
    evidenceQuality: GrowthStrategyEvidenceQuality.KNOWN,
    requiredScopesComplete: true,
    lastSuccessfulApiCallAt: now.toISOString(),
    lastAccountSyncAt: now.toISOString(),
    lastBoardSyncAt: now.toISOString(),
    analyticsStatus: "FRESH",
    lastAnalyticsSyncAt: now.toISOString(),
    activePins: 20,
    relevantPins: 10,
    boardCount: 3,
    metrics: {
      state: "KNOWN",
      observationDays: 28,
      impressions: "1000",
      saves: "20",
      pinClicks: "30",
      outboundClicks: "10",
      outboundCtrPercent: 1,
    },
    attributionCollection: "NOT_COLLECTING",
    qualifiedConversions: null,
    qualifiedConversionEvidence: "NOT_APPLICABLE",
    alignment: {
      status: "ALIGNED",
      consideredPins: 10,
      alignedPins: 9,
      reasons: [],
    },
    reasonCodes: ["ATTRIBUTION_NOT_COLLECTING"],
    recommendedAction: "Keep measuring.",
    ...overrides,
  };
}

describe("Growth account strategy", () => {
  it("uses the last 28 complete UTC days and a fixed model version", () => {
    const window = accountStrategyReviewWindow(now);
    expect(ACCOUNT_STRATEGY_MODEL_VERSION).toBe("account_strategy_v1");
    expect(window.reviewMonth.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(window.evidenceWindowStart.toISOString()).toBe(
      "2026-09-08T00:00:00.000Z",
    );
    expect(window.evidenceWindowEnd.toISOString()).toBe(
      "2026-10-05T00:00:00.000Z",
    );
  });

  it("evaluates healthy, reauth, stale, missing, and unconnected account states without fake zeros", () => {
    expect(evaluateAccountHealth(healthyAccount(), now)).toMatchObject({
      health: "HEALTHY",
      readiness: "READY",
    });
    expect(
      evaluateAccountHealth(
        healthyAccount({
          connectionStatus: GrowthPinterestConnectionStatus.REAUTH_REQUIRED,
        }),
        now,
      ),
    ).toMatchObject({
      health: "REAUTH_REQUIRED",
      readiness: "BLOCKED",
      reasonCodes: ["ROLE_REAUTH_REQUIRED"],
    });
    expect(
      evaluateAccountHealth(
        healthyAccount({
          lastAnalyticsSyncAt: new Date("2026-09-01T00:00:00Z"),
        }),
        now,
      ),
    ).toMatchObject({
      health: "NEEDS_ATTENTION",
      reasonCodes: expect.arrayContaining(["ANALYTICS_STALE"]),
    });
    expect(
      evaluateAccountHealth(
        healthyAccount({ analyticsStatus: null, observationDays: 0 }),
        now,
      ),
    ).toMatchObject({
      health: "INSUFFICIENT_DATA",
      reasonCodes: expect.arrayContaining(["ANALYTICS_MISSING"]),
    });
    expect(evaluateAccountHealth(null, now)).toMatchObject({
      health: "NOT_CONNECTED",
      evidenceQuality: GrowthStrategyEvidenceQuality.NOT_APPLICABLE,
    });
    expect(
      evaluateAccountHealth(
        healthyAccount({ boardCount: 0, relevantPins: 2 }),
        now,
      ),
    ).toMatchObject({
      health: "INSUFFICIENT_DATA",
      reasonCodes: expect.arrayContaining([
        "BOARD_COVERAGE_LOW",
        "INSUFFICIENT_RELEVANT_PINS",
      ]),
    });
  });

  it("evaluates intent alignment deterministically without Phase 7 clustering", () => {
    const utilityPins = Array.from({ length: 8 }, (_, index) => ({
      destinationUrl: `https://saytwist.com/translators/t-${index}`,
      title: "Translator",
      description: null,
    }));
    expect(
      evaluateIntentAlignment(
        GrowthPinterestPublicationRole.SAYTWIST,
        utilityPins,
      ).status,
    ).toBe("ALIGNED");
    const mixedIdeas = [
      ...Array.from({ length: 4 }, (_, index) => ({
        destinationUrl: `https://saytwist.com/ideas/i-${index}`,
        title: "Ideas",
        description: null,
      })),
      ...Array.from({ length: 4 }, (_, index) => ({
        destinationUrl: `https://saytwist.com/translators/t-${index}`,
        title: "Tool",
        description: null,
      })),
    ];
    expect(
      evaluateIntentAlignment(
        GrowthPinterestPublicationRole.SAYTWIST_IDEAS,
        mixedIdeas,
      ),
    ).toMatchObject({ status: "MIXED", reasons: ["INTENT_MIXED"] });
    expect(
      evaluateIntentAlignment(
        GrowthPinterestPublicationRole.SAYTWIST_PLAYGROUND,
        utilityPins,
      ).status,
    ).toBe("MISALIGNED");
    expect(
      evaluateIntentAlignment(
        GrowthPinterestPublicationRole.SAYTWIST_IDEAS,
        mixedIdeas.slice(0, 3),
      ).status,
    ).toBe("INSUFFICIENT_DATA");
  });

  it("keeps board eligibility advisory and does not use performance as the sole rule", () => {
    expect(
      evaluateBoardEligibility({
        accountConnected: true,
        accountBlocked: false,
        accountAlignment: "ALIGNED",
        active: true,
        privacy: "PUBLIC",
        pinCount: 10,
        relevantPinCount: 4,
      }),
    ).toEqual({ eligibility: "ELIGIBLE", reasonCodes: [] });
    expect(
      evaluateBoardEligibility({
        accountConnected: true,
        accountBlocked: false,
        accountAlignment: "ALIGNED",
        active: false,
        privacy: "PUBLIC",
        pinCount: 10,
        relevantPinCount: 4,
      }),
    ).toMatchObject({
      eligibility: "NOT_ELIGIBLE",
      reasonCodes: ["BOARD_INACTIVE"],
    });
    expect(
      evaluateBoardEligibility({
        accountConnected: true,
        accountBlocked: false,
        accountAlignment: "ALIGNED",
        active: true,
        privacy: "SECRET",
        pinCount: 10,
        relevantPinCount: 4,
      }),
    ).toMatchObject({
      eligibility: "NOT_ELIGIBLE",
      reasonCodes: ["BOARD_NOT_PUBLIC"],
    });
    expect(
      evaluateBoardEligibility({
        accountConnected: true,
        accountBlocked: false,
        accountAlignment: "ALIGNED",
        active: true,
        privacy: "PUBLIC",
        pinCount: 0,
        relevantPinCount: 0,
      }),
    ).toMatchObject({ eligibility: "INSUFFICIENT_DATA" });
    expect(
      evaluateBoardEligibility({
        accountConnected: true,
        accountBlocked: true,
        accountAlignment: "ALIGNED",
        active: true,
        privacy: "PUBLIC",
        pinCount: 10,
        relevantPinCount: 4,
      }),
    ).toMatchObject({
      eligibility: "NOT_ELIGIBLE",
      reasonCodes: ["ROLE_REAUTH_REQUIRED"],
    });
  });

  it("uses BigInt-safe concentration and blocks expansion when one Pin dominates", () => {
    const huge = BigInt("900719925474099300000");
    const concentration = concentrationForRole(
      GrowthPinterestPublicationRole.SAYTWIST,
      [
        { impressions: huge * BigInt(9), outboundClicks: huge * BigInt(9) },
        { impressions: huge, outboundClicks: huge },
      ],
    );
    expect(concentration.topPinOutboundSharePercent).toBe(90);
    const portfolio = evaluatePortfolio({
      roles: [
        role(GrowthPinterestPublicationRole.SAYTWIST),
        role(GrowthPinterestPublicationRole.SAYTWIST_IDEAS),
        role(GrowthPinterestPublicationRole.SAYTWIST_PLAYGROUND),
      ],
      concentration: [concentration],
      attributionCollecting: false,
    });
    expect(portfolio.recommendation).not.toBe("RECOMMEND_NEW_ACCOUNT");
    expect(portfolio.reasonCodes).toContain("HIGH_TOP_PIN_CONCENTRATION");
    expect(portfolio.confidence).toBe(80);
  });

  it("represents all roles and prioritizes the incomplete baseline over a fourth account", () => {
    const roles = [
      role(GrowthPinterestPublicationRole.SAYTWIST),
      role(GrowthPinterestPublicationRole.SAYTWIST_IDEAS, {
        accountId: null,
        username: null,
        connectionStatus: null,
        health: "NOT_CONNECTED",
        readiness: "NOT_CONNECTED",
        evidenceQuality: GrowthStrategyEvidenceQuality.NOT_APPLICABLE,
        activePins: null,
        relevantPins: null,
        boardCount: null,
        metrics: {
          state: "NOT_APPLICABLE",
          observationDays: 0,
          impressions: null,
          saves: null,
          pinClicks: null,
          outboundClicks: null,
          outboundCtrPercent: null,
        },
        reasonCodes: ["ROLE_NOT_CONNECTED"],
        alignment: {
          status: "INSUFFICIENT_DATA",
          consideredPins: 0,
          alignedPins: 0,
          reasons: [],
        },
      }),
      role(GrowthPinterestPublicationRole.SAYTWIST_PLAYGROUND, {
        accountId: null,
        username: null,
        connectionStatus: null,
        health: "NOT_CONNECTED",
        readiness: "NOT_CONNECTED",
        evidenceQuality: GrowthStrategyEvidenceQuality.NOT_APPLICABLE,
        activePins: null,
        relevantPins: null,
        boardCount: null,
        metrics: {
          state: "NOT_APPLICABLE",
          observationDays: 0,
          impressions: null,
          saves: null,
          pinClicks: null,
          outboundClicks: null,
          outboundCtrPercent: null,
        },
        reasonCodes: ["ROLE_NOT_CONNECTED"],
        alignment: {
          status: "INSUFFICIENT_DATA",
          consideredPins: 0,
          alignedPins: 0,
          reasons: [],
        },
      }),
    ];
    const first = evaluatePortfolio({
      roles,
      concentration: [],
      attributionCollecting: false,
    });
    const second = evaluatePortfolio({
      roles,
      concentration: [],
      attributionCollecting: false,
    });
    expect(first).toEqual(second);
    expect(first).toMatchObject({
      connectedRoles: 1,
      recommendation: "COMPLETE_BASELINE_PORTFOLIO",
      recommendedAccountCount: 3,
    });
    expect(first.reasonCodes).toEqual(
      expect.arrayContaining([
        "BASELINE_PORTFOLIO_INCOMPLETE",
        "NO_EXPANSION_EVIDENCE",
      ]),
    );
  });

  it("rejects unbounded stored board evidence", () => {
    const base = {
      modelVersion: "account_strategy_v1",
      reviewMonth: "2026-10",
      evidenceWindowStart: "2026-09-08",
      evidenceWindowEnd: "2026-10-05",
      attributionCapability: "AVAILABLE",
      attributionCollection: "NOT_COLLECTING",
      roles: [
        role(GrowthPinterestPublicationRole.SAYTWIST),
        role(GrowthPinterestPublicationRole.SAYTWIST_IDEAS),
        role(GrowthPinterestPublicationRole.SAYTWIST_PLAYGROUND),
      ],
      boards: [],
      concentration: [],
      portfolio: evaluatePortfolio({
        roles: [
          role(GrowthPinterestPublicationRole.SAYTWIST),
          role(GrowthPinterestPublicationRole.SAYTWIST_IDEAS),
          role(GrowthPinterestPublicationRole.SAYTWIST_PLAYGROUND),
        ],
        concentration: [],
        attributionCollecting: false,
      }),
    };
    const board = {
      accountRole: GrowthPinterestPublicationRole.SAYTWIST,
      accountUsername: "saytwist",
      pinterestBoardId: "board",
      name: "Board",
      privacy: "PUBLIC",
      active: true,
      pinCount: 1,
      relevantPinCount: 1,
      metrics: {
        state: "KNOWN",
        observationDays: 28,
        impressions: "1",
        saves: "0",
        pinClicks: "0",
        outboundClicks: "0",
        outboundCtrPercent: 0,
      },
      eligibility: "ELIGIBLE",
      reasonCodes: [],
      lastSyncedAt: now.toISOString(),
    };
    expect(
      accountStrategyEvidenceSchema.safeParse({
        ...base,
        boards: Array.from({ length: 101 }, (_, index) => ({
          ...board,
          pinterestBoardId: `board-${index}`,
        })),
      }).success,
    ).toBe(false);
  });
});
