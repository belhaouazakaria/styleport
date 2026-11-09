import { z } from "zod";

/** Fresh official owned-Pin metrics, not visible third-party popularity. */
export const viralWinnerPolicySchema = z.object({
  minAgeDays: z.number().int().min(1).max(90),
  maxEvidenceAgeHours: z.number().int().min(1).max(168),
  minImpressions: z.number().int().min(100).max(1000000),
  minSaves: z.number().int().min(1).max(100000),
  minOutboundClicks: z.number().int().min(1).max(100000),
  minSaveRate: z.number().min(0).max(1),
  minOutboundRate: z.number().min(0).max(1),
  minLiftOverBaseline: z.number().min(1).max(10),
}).strict();

export const DEFAULT_VIRAL_WINNER_POLICY = {
  minAgeDays: 3, maxEvidenceAgeHours: 48, minImpressions: 600,
  minSaves: 12, minOutboundClicks: 6, minSaveRate: 0.015,
  minOutboundRate: 0.0075, minLiftOverBaseline: 1.5,
} satisfies z.infer<typeof viralWinnerPolicySchema>;

export type ViralPinMetrics = {
  impressions: number | null; saves: number | null;
  outboundClicks: number | null; measuredAt: Date | null;
  publishedAt: Date | null;
  // Comparison only against contemporaneous owned Pins, not an inferred competitor baseline.
  baselineSaveRate: number | null;
  baselineOutboundRate: number | null;
  pinterestDataStatus: "READY" | "PROCESSING" | "MISSING";
};

export type ViralWinnerDecision = {
  status: "WINNER" | "NOT_WINNING" | "INSUFFICIENT_DATA";
  saveRate: number | null;
  outboundRate: number | null;
  saveLift: number | null;
  outboundLift: number | null;
  reasons: string[];
  recommendedAction: "PREPARE_ORIGINAL_TRANSLATOR_AND_NICHE" | "KEEP_COLLECTING";
};

function count(n: number | null): n is number {
  return n !== null && Number.isSafeInteger(n) && n >= 0;
}

export function evaluateViralWinner(
  e: ViralPinMetrics,
  now = new Date(),
  rawPolicy = DEFAULT_VIRAL_WINNER_POLICY,
): ViralWinnerDecision {
  const p = viralWinnerPolicySchema.parse(rawPolicy);
  const base: ViralWinnerDecision = {
    status: "INSUFFICIENT_DATA", saveRate: null, outboundRate: null,
    saveLift: null, outboundLift: null, reasons: [],
    recommendedAction: "KEEP_COLLECTING",
  };
  if (!Number.isFinite(now.getTime()) || e.pinterestDataStatus !== "READY") {
    return { ...base, reasons: ["METRICS_UNAVAILABLE"] };
  }
  if (![e.impressions, e.saves, e.outboundClicks].every(count) ||
      !e.measuredAt || !e.publishedAt ||
      !Number.isFinite(e.measuredAt.getTime()) ||
      !Number.isFinite(e.publishedAt.getTime()) ||
      e.measuredAt > now || e.publishedAt > now ||
      now.getTime() - e.measuredAt.getTime() > p.maxEvidenceAgeHours * 3600000 ||
      now.getTime() - e.publishedAt.getTime() < p.minAgeDays * 86400000) {
    return { ...base, reasons: ["FRESH_MATURE_DATA_REQUIRED"] };
  }
  if (e.impressions! < p.minImpressions || e.saves! > e.impressions! ||
      e.outboundClicks! > e.impressions!) {
    return { ...base, reasons: ["INSUFFICIENT_OR_INVALID_EXPOSURE"] };
  }
  const bSave = e.baselineSaveRate, bOutbound = e.baselineOutboundRate;
  if (bSave === null || bOutbound === null ||
      !Number.isFinite(bSave) || !Number.isFinite(bOutbound) ||
      bSave <= 0 || bSave > 1 || bOutbound <= 0 || bOutbound > 1) {
    return { ...base, reasons: ["OWNED_ACCOUNT_BASELINE_REQUIRED"] };
  }
  const saveRate = e.saves! / e.impressions!;
  const outboundRate = e.outboundClicks! / e.impressions!;
  const saveLift = saveRate / bSave;
  const outboundLift = outboundRate / bOutbound;
  const winner = e.saves! >= p.minSaves &&
    e.outboundClicks! >= p.minOutboundClicks &&
    saveRate >= p.minSaveRate && outboundRate >= p.minOutboundRate &&
    (saveLift >= p.minLiftOverBaseline || outboundLift >= p.minLiftOverBaseline);
  return {
    status: winner ? "WINNER" : "NOT_WINNING",
    saveRate, outboundRate, saveLift, outboundLift,
    reasons: winner ? ["QUALIFIED_OWNED_PIN_WINNER"] : ["BELOW_WINNER_THRESHOLD"],
    recommendedAction: winner
      ? "PREPARE_ORIGINAL_TRANSLATOR_AND_NICHE" : "KEEP_COLLECTING",
  };
}
