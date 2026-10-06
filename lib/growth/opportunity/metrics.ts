import {
  GrowthOpportunityType,
  GrowthPinSignalType,
  GrowthSignalStrength,
} from "@prisma/client";
import { OPPORTUNITY_THRESHOLDS as T } from "./constants";

export interface DailyMetric {
  pinId: string;
  metricDate: Date;
  impressions: bigint;
  saves: bigint;
  pinClicks: bigint;
  outboundClicks: bigint;
}
export interface AggregatedCluster {
  impressions: bigint;
  saves: bigint;
  pinClicks: bigint;
  outboundClicks: bigint;
  recentImpressions: bigint;
  previousImpressions: bigint;
  recentSaves: bigint;
  previousSaves: bigint;
  recentOutboundClicks: bigint;
  previousOutboundClicks: bigint;
  activeWeekCount: number;
  observationDays: number;
  recentObservationDays: number;
  previousObservationDays: number;
  impressionVelocityPercent: number | null;
  outboundVelocityPercent: number | null;
  ctrChangePercent: number | null;
  saveRateChangePercent: number | null;
  recentCtrBasisPoints: number | null;
  previousCtrBasisPoints: number | null;
  recentSaveRateBasisPoints: number | null;
  previousSaveRateBasisPoints: number | null;
  topPinImpressionPercent: number | null;
  topThreeImpressionPercent: number | null;
  topPinOutboundPercent: number | null;
  topThreeOutboundPercent: number | null;
}
export interface ClassifiedSignal {
  type: GrowthPinSignalType;
  strength: GrowthSignalStrength;
  confidence: number;
  reasonCodes: string[];
}
export const hasIncompleteSignalWindow = (metrics: AggregatedCluster) =>
  metrics.observationDays < 14 || metrics.recentObservationDays < 5;
const bounded = (raw: bigint) =>
  Number(
    raw > BigInt(1000)
      ? BigInt(1000)
      : raw < -BigInt(1000)
        ? -BigInt(1000)
        : raw,
  );
const percent = (n: bigint, d: bigint) =>
  d === BigInt(0) ? null : Number((n * BigInt(100)) / d);
const velocity = (recent: bigint, previous: bigint) =>
  previous === BigInt(0)
    ? null
    : bounded(((recent - previous) * BigInt(100)) / previous);
const rateBp = (n: bigint, d: bigint) =>
  d === BigInt(0) ? null : Number((n * BigInt(10000)) / d);
function rateChange(rn: bigint, rd: bigint, pn: bigint, pd: bigint) {
  if (rd === BigInt(0) || pd === BigInt(0)) return null;
  const recent = (rn * BigInt(10000)) / rd,
    previous = (pn * BigInt(10000)) / pd;
  if (previous === BigInt(0)) return null;
  return bounded(((recent - previous) * BigInt(100)) / previous);
}
const sum = (
  rows: DailyMetric[],
  key: keyof Pick<
    DailyMetric,
    "impressions" | "saves" | "pinClicks" | "outboundClicks"
  >,
) => rows.reduce((n, r) => n + r[key], BigInt(0));
function concentration(values: bigint[]) {
  const total = values.reduce((a, b) => a + b, BigInt(0));
  const sorted = [...values].sort((a, b) => (a === b ? 0 : a > b ? -1 : 1));
  return {
    top1: percent(sorted[0] || BigInt(0), total),
    top3: percent(
      sorted.slice(0, 3).reduce((a, b) => a + b, BigInt(0)),
      total,
    ),
  };
}
export function aggregateClusterMetrics(
  rows: DailyMetric[],
  pinIds: string[],
  windowEnd: Date,
): AggregatedCluster {
  const selected = rows.filter((r) => pinIds.includes(r.pinId));
  const recentStart = new Date(windowEnd);
  recentStart.setUTCDate(recentStart.getUTCDate() - 6);
  const previousStart = new Date(recentStart);
  previousStart.setUTCDate(previousStart.getUTCDate() - 7);
  const recent = selected.filter((r) => r.metricDate >= recentStart);
  const previous = selected.filter(
    (r) => r.metricDate >= previousStart && r.metricDate < recentStart,
  );
  const ri = sum(recent, "impressions"),
    pi = sum(previous, "impressions"),
    rs = sum(recent, "saves"),
    ps = sum(previous, "saves"),
    ro = sum(recent, "outboundClicks"),
    po = sum(previous, "outboundClicks");
  const byPin = pinIds.map((id) => selected.filter((r) => r.pinId === id));
  const ci = concentration(byPin.map((r) => sum(r, "impressions"))),
    co = concentration(byPin.map((r) => sum(r, "outboundClicks")));
  const weeks = new Set(
    selected
      .filter((r) => r.impressions > BigInt(0) || r.outboundClicks > BigInt(0))
      .map((r) =>
        Math.floor(
          (windowEnd.getTime() - r.metricDate.getTime()) / (7 * 86400000),
        ),
      ),
  );
  return {
    impressions: sum(selected, "impressions"),
    saves: sum(selected, "saves"),
    pinClicks: sum(selected, "pinClicks"),
    outboundClicks: sum(selected, "outboundClicks"),
    recentImpressions: ri,
    previousImpressions: pi,
    recentSaves: rs,
    previousSaves: ps,
    recentOutboundClicks: ro,
    previousOutboundClicks: po,
    activeWeekCount: [...weeks].filter((x) => x >= 0 && x < 4).length,
    observationDays: new Set(
      selected.map((r) => r.metricDate.toISOString().slice(0, 10)),
    ).size,
    recentObservationDays: new Set(
      recent.map((r) => r.metricDate.toISOString().slice(0, 10)),
    ).size,
    previousObservationDays: new Set(
      previous.map((r) => r.metricDate.toISOString().slice(0, 10)),
    ).size,
    impressionVelocityPercent: velocity(ri, pi),
    outboundVelocityPercent: velocity(ro, po),
    ctrChangePercent: rateChange(ro, ri, po, pi),
    saveRateChangePercent: rateChange(rs, ri, ps, pi),
    recentCtrBasisPoints: rateBp(ro, ri),
    previousCtrBasisPoints: rateBp(po, pi),
    recentSaveRateBasisPoints: rateBp(rs, ri),
    previousSaveRateBasisPoints: rateBp(ps, pi),
    topPinImpressionPercent: ci.top1,
    topThreeImpressionPercent: ci.top3,
    topPinOutboundPercent: co.top1,
    topThreeOutboundPercent: co.top3,
  };
}
export function classifyPinSignals(m: AggregatedCluster): ClassifiedSignal[] {
  const signals: ClassifiedSignal[] = [];
  if (
    m.observationDays >= T.minimumObservationDays &&
    m.impressions >= T.winnerImpressions &&
    m.outboundClicks >= T.winnerOutboundClicks &&
    m.activeWeekCount >= T.winnerActiveWeeks
  )
    signals.push({
      type: GrowthPinSignalType.WINNER,
      strength: GrowthSignalStrength.STRONG,
      confidence: 85,
      reasonCodes: ["SUSTAINED_PIN_PERFORMANCE"],
    });
  const recentComplete = m.recentObservationDays >= 5,
    previousPresent = m.previousObservationDays >= 3;
  const stretchFromZero =
    m.previousImpressions === BigInt(0) &&
    m.previousOutboundClicks === BigInt(0) &&
    m.recentImpressions >= BigInt(1000) &&
    m.recentOutboundClicks >= BigInt(20);
  const reachUp = (m.impressionVelocityPercent ?? -1001) >= 25;
  const clicksUp = (m.outboundVelocityPercent ?? -1001) >= 50;
  const clickQualityOkay =
    (m.ctrChangePercent ?? 0) >= -30 ||
    (m.outboundVelocityPercent ?? -1001) >= 75;
  const saveQualityOkay =
    m.previousSaves < BigInt(5) ||
    (m.saveRateChangePercent ?? 0) >= -50 ||
    (m.outboundVelocityPercent ?? -1001) >= 75;
  if (
    recentComplete &&
    (previousPresent || stretchFromZero) &&
    m.recentImpressions >= T.risingRecentImpressions &&
    m.recentOutboundClicks >= T.risingRecentOutboundClicks &&
    (reachUp || clicksUp || stretchFromZero) &&
    clickQualityOkay &&
    saveQualityOkay
  )
    signals.push({
      type: GrowthPinSignalType.RISING,
      strength: GrowthSignalStrength.STRONG,
      confidence: reachUp && clicksUp ? 90 : 75,
      reasonCodes: [
        clicksUp ? "OUTBOUND_GROWTH" : "REACH_GROWTH",
        "CLICK_QUALITY_SUPPORTED",
      ],
    });
  const priorMeaningful =
    m.previousImpressions >= T.fatiguePreviousImpressions &&
    m.previousOutboundClicks >= T.fatiguePreviousOutboundClicks;
  const reachDown = (m.impressionVelocityPercent ?? 1001) <= -40,
    clicksDown = (m.outboundVelocityPercent ?? 1001) <= -30;
  if (
    priorMeaningful &&
    m.previousObservationDays >= 5 &&
    m.recentObservationDays >= 5 &&
    reachDown &&
    clicksDown
  ) {
    const improvingQuality = (m.ctrChangePercent ?? -1001) >= 20;
    const support =
      (m.ctrChangePercent !== null && m.ctrChangePercent <= -10) ||
      (m.saveRateChangePercent !== null && m.saveRateChangePercent <= -20) ||
      (m.outboundVelocityPercent ?? 0) <= -50;
    signals.push({
      type: GrowthPinSignalType.FATIGUE,
      strength:
        !improvingQuality && support
          ? GrowthSignalStrength.STRONG
          : GrowthSignalStrength.CAUTIOUS,
      confidence: !improvingQuality && support ? 80 : 50,
      reasonCodes: [
        "REACH_DECLINE",
        "OUTBOUND_DECLINE",
        ...(improvingQuality
          ? ["CLICK_QUALITY_IMPROVING"]
          : support
            ? ["QUALITY_DECLINE"]
            : ["QUALITY_MIXED"]),
      ],
    });
  }
  return signals;
}
export function qualifyClusterOpportunities(input: {
  metrics: AggregatedCluster;
  pinMetrics: AggregatedCluster[];
  pinCount: number;
  destinations: number;
  stale: boolean;
}) {
  const { metrics: m, pinMetrics, pinCount, destinations, stale } = input;
  if (stale || m.observationDays < T.minimumObservationDays) return [];
  const out: GrowthOpportunityType[] = [];
  const concentration = m.topPinOutboundPercent ?? 100;
  const meaningful = pinMetrics.filter(
    (p) =>
      p.impressions >= BigInt(250) &&
      p.outboundClicks >= BigInt(5) &&
      p.activeWeekCount >= 2 &&
      p.observationDays >= T.minimumObservationDays,
  ).length;
  const clusterSignals = classifyPinSignals(m);
  const strongFatigue = clusterSignals.some(
    (signal) =>
      signal.type === GrowthPinSignalType.FATIGUE &&
      signal.strength === GrowthSignalStrength.STRONG,
  );
  const strongRising = clusterSignals.some(
    (signal) =>
      signal.type === GrowthPinSignalType.RISING &&
      signal.strength === GrowthSignalStrength.STRONG,
  );
  if (
    !strongFatigue &&
    clusterSignals.some(
      (signal) => signal.type === GrowthPinSignalType.WINNER,
    ) &&
    meaningful >= 2 &&
    concentration <= 80
  )
    out.push(GrowthOpportunityType.AMPLIFY_WINNER);
  const recentContributors = pinMetrics.filter(
    (p) =>
      p.recentImpressions >= BigInt(200) &&
      p.recentOutboundClicks >= BigInt(5) &&
      p.recentObservationDays >= 5 &&
      p.previousObservationDays >= 3,
  ).length;
  if (
    !strongFatigue &&
    strongRising &&
    recentContributors >= 2 &&
    concentration <= 80
  )
    out.push(GrowthOpportunityType.EXPLORE_RISING_TOPIC);
  const priorContributors = pinMetrics.filter(
    (p) =>
      p.previousImpressions >= BigInt(200) &&
      p.previousOutboundClicks >= BigInt(5) &&
      p.previousObservationDays >= 5 &&
      p.recentObservationDays >= 5,
  ).length;
  if (strongFatigue && priorContributors >= 2)
    out.push(GrowthOpportunityType.INVESTIGATE_FATIGUE);
  if (
    m.outboundClicks >= T.inventoryGapOutboundClicks &&
    pinCount >= 3 &&
    meaningful >= 2 &&
    destinations <= 1
  )
    out.push(GrowthOpportunityType.FILL_INVENTORY_GAP);
  return out;
}
