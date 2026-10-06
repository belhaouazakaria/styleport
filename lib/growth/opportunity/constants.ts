export const OPPORTUNITY_INTELLIGENCE_VERSION = "opportunity_intelligence_v2";
export const OPPORTUNITY_SCORING_VERSION = "opportunity_scoring_v1";
export const CONTENT_CLUSTERING_VERSION = "content_clustering_v2";
export const OPPORTUNITY_WINDOW_DAYS = 28;
export const OPPORTUNITY_PIN_CAP = 500;
export const OPPORTUNITY_MAX_CLUSTERS = 100;
export const OPPORTUNITY_MAX_MEMBERS_PER_CLUSTER = 100;
export const OPPORTUNITY_MAX_OPPORTUNITIES = 100;
export const OPPORTUNITY_MAX_PIN_SIGNALS = 1_500;
export const OPPORTUNITY_ANALYTICS_FRESH_MS = 36 * 60 * 60 * 1_000;
export const OPPORTUNITY_THRESHOLDS = Object.freeze({
  minimumClusterPins: 2,
  minimumObservationDays: 14,
  winnerImpressions: BigInt(1000),
  winnerOutboundClicks: BigInt(20),
  winnerActiveWeeks: 3,
  risingRecentImpressions: BigInt(500),
  risingRecentOutboundClicks: BigInt(10),
  risingGrowthPercent: 50,
  fatiguePreviousImpressions: BigInt(500),
  fatiguePreviousOutboundClicks: BigInt(10),
  fatigueDeclinePercent: -50,
  inventoryGapOutboundClicks: BigInt(30),
  concentrationPercent: 70,
});
export function opportunityWindow(now = new Date()) {
  const analysisDate = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const evidenceWindowEnd = new Date(analysisDate);
  evidenceWindowEnd.setUTCDate(evidenceWindowEnd.getUTCDate() - 1);
  const evidenceWindowStart = new Date(evidenceWindowEnd);
  evidenceWindowStart.setUTCDate(evidenceWindowStart.getUTCDate() - 27);
  return { analysisDate, evidenceWindowStart, evidenceWindowEnd };
}
export const dateKey = (value: Date) => value.toISOString().slice(0, 10);
