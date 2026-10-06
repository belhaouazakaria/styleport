import { GrowthOpportunityType } from "@prisma/client";
import type { AggregatedCluster } from "./metrics";
const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
const ratio = (n: bigint, target: bigint) =>
  clamp(Number((n * BigInt(100)) / target));
export function scoreOpportunity(input: {
  type: GrowthOpportunityType;
  metrics: AggregatedCluster;
  pinCount: number;
  destinationCount: number;
  evidencePartial: boolean;
  stale: boolean;
  qualifiedConversions: number | null;
}) {
  const m = input.metrics;
  const demand = clamp(
    (ratio(m.impressions, BigInt(5000)) + ratio(m.outboundClicks, BigInt(50))) /
      2,
  );
  const contentFit = clamp(
    55 +
      Math.min(30, input.pinCount * 5) +
      Math.min(15, input.destinationCount * 3),
  );
  const freshness =
    input.type === GrowthOpportunityType.EXPLORE_RISING_TOPIC
      ? clamp(
          50 +
            Math.max(
              m.impressionVelocityPercent || 0,
              m.outboundVelocityPercent || 0,
            ) /
              2,
        )
      : input.type === GrowthOpportunityType.INVESTIGATE_FATIGUE
        ? 30
        : 70;
  const concentration = (m.topPinOutboundPercent || 0) >= 70 ? 15 : 0;
  const confidence = clamp(
    100 -
      (input.evidencePartial ? 15 : 0) -
      (input.stale ? 25 : 0) -
      concentration -
      (m.observationDays < 28 ? Math.min(30, (28 - m.observationDays) * 2) : 0),
  );
  const conversion =
    input.qualifiedConversions === null
      ? null
      : clamp(input.qualifiedConversions * 10);
  const duplication = Math.max(
    0,
    Math.min(
      15,
      (input.pinCount - Math.max(1, input.destinationCount) * 3) * 3,
    ),
  );
  const risk = (input.stale ? 15 : 0) + (input.evidencePartial ? 10 : 0);
  const raw =
    conversion === null
      ? (demand * 45 + contentFit * 25 + freshness * 20 + confidence * 10) / 100
      : (demand * 35 +
          conversion * 20 +
          contentFit * 20 +
          freshness * 15 +
          confidence * 10) /
        100;
  return {
    score: clamp(raw - duplication - concentration - risk),
    confidence,
    components: {
      demand,
      contentFit,
      freshness,
      conversion,
      evidenceConfidence: confidence,
      duplicationPenalty: duplication,
      concentrationPenalty: concentration,
      riskPenalty: risk,
      cost: null as null,
      costState: "NOT_APPLICABLE" as const,
    },
  };
}
