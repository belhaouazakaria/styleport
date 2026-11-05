/**
 * Pure trigger policy for a separate future guarded research scheduler.
 * Intentionally not connected to the live 3-job daily intelligence timer.
 */
export type MarketResearchNeed = {
  decision: "RESEARCH_DUE" | "NOT_DUE" | "BLOCKED";
  reason: "INTERNAL_OPPORTUNITY_SHORTFALL" | "PERIODIC_MARKET_SCAN" |
    "RECENT_MARKET_SCAN" | "NO_PROVIDER_ACCESS" | "GLOBAL_QUOTA_UNAVAILABLE";
};

export function planProactiveMarketResearch(input: {
  now: Date;
  lastCompletedScanAt: Date | null;
  internalEligibleOpportunities: number;
  desiredDailyCandidateMinimum: number;
  approvedSourceAvailable: boolean;
  conservativePinterestBudgetAvailable: boolean;
}): MarketResearchNeed {
  if (!Number.isFinite(input.now.getTime()) ||
      (input.lastCompletedScanAt && !Number.isFinite(input.lastCompletedScanAt.getTime())) ||
      !Number.isSafeInteger(input.internalEligibleOpportunities) ||
      input.internalEligibleOpportunities < 0 ||
      !Number.isSafeInteger(input.desiredDailyCandidateMinimum) ||
      input.desiredDailyCandidateMinimum < 1 ||
      input.desiredDailyCandidateMinimum > 10) {
    throw Error("MARKET_RESEARCH_NEED_INVALID");
  }
  if (!input.approvedSourceAvailable) return {
    decision: "BLOCKED", reason: "NO_PROVIDER_ACCESS",
  };
  if (!input.conservativePinterestBudgetAvailable) return {
    decision: "BLOCKED", reason: "GLOBAL_QUOTA_UNAVAILABLE",
  };
  const age = input.lastCompletedScanAt ?
    input.now.getTime() - input.lastCompletedScanAt.getTime() : Infinity;
  if (age < 0) throw Error("MARKET_RESEARCH_NEED_INVALID");
  // One scan per rolling 24h (enforced again in DB), even with a shortfall.
  if (age < 24 * 60 * 60_000) {
    return { decision: "NOT_DUE", reason: "RECENT_MARKET_SCAN" };
  }
  if (input.internalEligibleOpportunities < input.desiredDailyCandidateMinimum) {
    return { decision: "RESEARCH_DUE", reason: "INTERNAL_OPPORTUNITY_SHORTFALL" };
  }
  // Proactive discovery every 72h, not only when the catalog is exhausted.
  return age >= 72 * 60 * 60_000 ?
    { decision: "RESEARCH_DUE", reason: "PERIODIC_MARKET_SCAN" } :
    { decision: "NOT_DUE", reason: "RECENT_MARKET_SCAN" };
}
