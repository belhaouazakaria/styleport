import {
  GrowthAccountStrategyRecommendation,
  GrowthStrategyEvidenceQuality,
} from "@prisma/client";

import {
  ACCOUNT_STRATEGY_HIGH_CONCENTRATION_PERCENT,
  ACCOUNT_STRATEGY_PLANNED_ACCOUNT_COUNT,
} from "@/lib/growth/strategy/constants";
import type {
  ConcentrationEvidence,
  RoleReadiness,
  RoleStrategy,
  StrategyReasonCode,
} from "@/lib/growth/strategy/contracts";

export function bigintPercent(numerator: bigint, denominator: bigint) {
  if (denominator <= BigInt(0)) return null;
  return Number((numerator * BigInt(10_000)) / denominator) / 100;
}

export function concentrationForRole(
  role: ConcentrationEvidence["role"],
  rows: Array<{ impressions: bigint; outboundClicks: bigint }>,
): ConcentrationEvidence {
  const byOutbound = [...rows].sort((a, b) =>
    a.outboundClicks === b.outboundClicks
      ? 0
      : a.outboundClicks > b.outboundClicks
        ? -1
        : 1,
  );
  const byImpressions = [...rows].sort((a, b) =>
    a.impressions === b.impressions
      ? 0
      : a.impressions > b.impressions
        ? -1
        : 1,
  );
  const outboundTotal = rows.reduce(
    (sum, row) => sum + row.outboundClicks,
    BigInt(0),
  );
  const impressionTotal = rows.reduce(
    (sum, row) => sum + row.impressions,
    BigInt(0),
  );
  return {
    role,
    contributingPins: rows.filter(
      (row) => row.impressions > BigInt(0) || row.outboundClicks > BigInt(0),
    ).length,
    topPinOutboundSharePercent: bigintPercent(
      byOutbound[0]?.outboundClicks || BigInt(0),
      outboundTotal,
    ),
    topThreeOutboundSharePercent: bigintPercent(
      byOutbound
        .slice(0, 3)
        .reduce((sum, row) => sum + row.outboundClicks, BigInt(0)),
      outboundTotal,
    ),
    topPinImpressionSharePercent: bigintPercent(
      byImpressions[0]?.impressions || BigInt(0),
      impressionTotal,
    ),
    topThreeImpressionSharePercent: bigintPercent(
      byImpressions
        .slice(0, 3)
        .reduce((sum, row) => sum + row.impressions, BigInt(0)),
      impressionTotal,
    ),
  };
}

export function evaluatePortfolio(input: {
  roles: RoleStrategy[];
  concentration: ConcentrationEvidence[];
  attributionCollecting: boolean;
}) {
  const connectedRoles = input.roles.filter(
    (role) => role.accountId !== null,
  ).length;
  const healthyRoles = input.roles.filter(
    (role) => role.health === "HEALTHY",
  ).length;
  const rolesNeedingAttention = input.roles.filter((role) =>
    ["NEEDS_ATTENTION", "REAUTH_REQUIRED"].includes(role.health),
  ).length;
  const rolesWithoutEnoughData = input.roles.filter((role) =>
    ["INSUFFICIENT_DATA", "NOT_CONNECTED"].includes(role.health),
  ).length;
  const reasons = new Set<StrategyReasonCode>();
  let confidence = 100;

  for (const role of input.roles) {
    if (role.health === "NOT_CONNECTED") confidence -= 15;
    else if (role.health === "REAUTH_REQUIRED") confidence -= 20;
    else if (role.health === "NEEDS_ATTENTION") confidence -= 10;
    else if (role.health === "INSUFFICIENT_DATA") confidence -= 8;
    if (role.alignment.status === "MISALIGNED") confidence -= 15;
    else if (role.alignment.status === "MIXED") confidence -= 5;
    else if (role.alignment.status === "INSUFFICIENT_DATA" && role.accountId)
      confidence -= 5;
    for (const reason of role.reasonCodes) reasons.add(reason);
  }
  if (!input.attributionCollecting) {
    confidence -= 10;
    reasons.add("ATTRIBUTION_NOT_COLLECTING");
  }
  if (
    input.concentration.some(
      (item) =>
        (item.topPinOutboundSharePercent || 0) >=
          ACCOUNT_STRATEGY_HIGH_CONCENTRATION_PERCENT ||
        (item.topPinImpressionSharePercent || 0) >=
          ACCOUNT_STRATEGY_HIGH_CONCENTRATION_PERCENT,
    )
  ) {
    confidence -= 10;
    reasons.add("HIGH_TOP_PIN_CONCENTRATION");
  }

  let recommendation: GrowthAccountStrategyRecommendation;
  let readiness: RoleReadiness;
  let summary: string;
  if (connectedRoles < ACCOUNT_STRATEGY_PLANNED_ACCOUNT_COUNT) {
    recommendation =
      GrowthAccountStrategyRecommendation.COMPLETE_BASELINE_PORTFOLIO;
    readiness = connectedRoles === 0 ? "NOT_CONNECTED" : "PARTIAL";
    reasons.add("BASELINE_PORTFOLIO_INCOMPLETE");
    reasons.add("NO_EXPANSION_EVIDENCE");
    summary =
      "Complete and evaluate the three-intent baseline before considering another Pinterest account.";
  } else if (
    input.roles.some((role) => role.alignment.status === "MISALIGNED")
  ) {
    recommendation =
      GrowthAccountStrategyRecommendation.REPOSITION_EXISTING_ROLE;
    readiness = "PARTIAL";
    reasons.add("INTENT_MISALIGNED");
    reasons.add("NO_EXPANSION_EVIDENCE");
    summary =
      "Review the positioning of an existing role before expanding the portfolio.";
  } else if (
    input.roles.some(
      (role) =>
        role.health !== "HEALTHY" || role.alignment.status !== "ALIGNED",
    )
  ) {
    recommendation = GrowthAccountStrategyRecommendation.WAIT_FOR_MORE_DATA;
    readiness = rolesNeedingAttention ? "PARTIAL" : "INSUFFICIENT_DATA";
    reasons.add("NO_EXPANSION_EVIDENCE");
    reasons.add("FUTURE_CLUSTER_EVIDENCE_REQUIRED");
    summary =
      "Keep the three planned roles and gather fresher, broader evidence before changing account count.";
  } else {
    recommendation = GrowthAccountStrategyRecommendation.KEEP_CURRENT_PORTFOLIO;
    readiness = "READY";
    reasons.add("THREE_ROLE_MODEL_STILL_APPROPRIATE");
    reasons.add("NO_EXPANSION_EVIDENCE");
    reasons.add("FUTURE_CLUSTER_EVIDENCE_REQUIRED");
    summary =
      "The three intent-driven roles remain appropriate; Phase 6 has no durable evidence for a fourth account.";
  }

  const evidenceQuality =
    connectedRoles === 0
      ? GrowthStrategyEvidenceQuality.UNKNOWN
      : connectedRoles < 3 ||
          input.roles.some(
            (role) =>
              role.evidenceQuality !== GrowthStrategyEvidenceQuality.KNOWN,
          ) ||
          !input.attributionCollecting
        ? GrowthStrategyEvidenceQuality.INSUFFICIENT_DATA
        : GrowthStrategyEvidenceQuality.KNOWN;

  return {
    plannedRoles: 3 as const,
    connectedRoles,
    healthyRoles,
    rolesNeedingAttention,
    rolesWithoutEnoughData,
    readiness,
    recommendation,
    recommendedAccountCount: 3,
    confidence: Math.max(0, Math.min(100, confidence)),
    evidenceQuality,
    reasonCodes: [...reasons].slice(0, 24),
    summary,
  };
}
