import { z } from "zod";

/** Pure planning only. Does not approve Pins, make provider calls or activate jobs. */
export const viralPortfolioPolicySchema = z.object({
  mode: z.enum(["PAUSED", "REVIEW", "ACTIVE"]),
  sourceSharePercent: z.number().int().min(0).max(100),
  maxPinsPerDay: z.number().int().min(0).max(10),
}).strict();

export type ViralPortfolioPolicy = z.infer<typeof viralPortfolioPolicySchema>;
export const DEFAULT_VIRAL_PORTFOLIO_POLICY: ViralPortfolioPolicy = {
  mode: "PAUSED", sourceSharePercent: 50, maxPinsPerDay: 3,
};

export type ViralPortfolioEvidence = {
  day: string;
  // All previously approved and in-flight Pin publications count against the cap.
  saytwistCommitted: number;
  sourceCommitted: number;
  hardDailyPinCap: number;
  remainingProviderPublicationCapacity: number;
  sourceConceptsQualified: number;
  originalConceptsQualified: number;
  // External links need a valid, truthfully described source and ORIGINAL creative.
  sourcePublishingRightsVerified: boolean;
};

export type ViralPortfolioPlan = {
  status: "PAUSED" | "REVIEW_ONLY" | "READY" | "LIMITED";
  target: { saytwist: number; source: number };
  additional: { saytwist: number; source: number };
  committed: number;
  reasons: string[];
  pinPublicationAutomaticallyApproved: false;
  destinationRewritesAuthorized: false;
};

function quantity(n: number): boolean {
  return Number.isSafeInteger(n) && n >= 0 && n <= 100000;
}

export function planViralPortfolio(raw: ViralPortfolioPolicy, e: ViralPortfolioEvidence): ViralPortfolioPlan {
  const policy = viralPortfolioPolicySchema.parse(raw);
  const date = new Date(e.day + "T00:00:00.000Z");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.day) ||
      !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== e.day) {
    throw Error("VIRAL_PORTFOLIO_DAY_INVALID");
  }
  for (const n of [
    e.saytwistCommitted, e.sourceCommitted, e.hardDailyPinCap,
    e.remainingProviderPublicationCapacity, e.sourceConceptsQualified,
    e.originalConceptsQualified,
  ]) if (!quantity(n)) throw Error("VIRAL_PORTFOLIO_EVIDENCE_INVALID");

  const committed = e.saytwistCommitted + e.sourceCommitted;
  const total = Math.min(policy.maxPinsPerDay, e.hardDailyPinCap);
  const sourceFraction = total * policy.sourceSharePercent / 100;
  // Fair deterministic 50:50 allocation for odd quotas across consecutive UTC days.
  const lower = Math.floor(sourceFraction);
  const fraction = sourceFraction - lower;
  const dayIndex = Math.floor(date.getTime() / 86400000);
  const source = lower + (fraction > 0 && (dayIndex % 2 === 0 ? fraction >= 0.5 : fraction > 0.5) ? 1 : 0);
  const saytwist = total - source;
  const target = { saytwist, source };
  const base: ViralPortfolioPlan = {
    status: "PAUSED", target, additional: { saytwist: 0, source: 0 },
    committed, reasons: [], pinPublicationAutomaticallyApproved: false,
    destinationRewritesAuthorized: false,
  };
  if (policy.mode === "PAUSED") return { ...base, reasons: ["OWNER_PAUSED"] };
  if (policy.mode === "REVIEW") return { ...base, status: "REVIEW_ONLY", reasons: ["REVIEW_ONLY"] };
  if (!e.sourcePublishingRightsVerified && source > 0) base.reasons.push("SOURCE_RIGHTS_UNVERIFIED");
  if (committed >= total) base.reasons.push("DAILY_CAP");
  const available = Math.max(0, Math.min(e.remainingProviderPublicationCapacity, total - committed));
  const wantSaytwist = Math.min(Math.max(0, saytwist - e.saytwistCommitted), e.originalConceptsQualified);
  const wantSource = e.sourcePublishingRightsVerified
    ? Math.min(Math.max(0, source - e.sourceCommitted), e.sourceConceptsQualified) : 0;
  // Never silently reassign unavailable source slots to SayTwist, or the reverse.
  const saytwistAdditional = Math.min(wantSaytwist, available);
  const sourceAdditional = Math.min(wantSource, available - saytwistAdditional);
  if (wantSaytwist + wantSource > available) base.reasons.push("PROVIDER_OR_BUDGET_CAP");
  if (saytwistAdditional + sourceAdditional < Math.max(0, total - committed)) {
    base.reasons.push("QUALIFICATION_OR_QUOTA_LIMIT");
  }
  return {
    ...base, status: base.reasons.length ? "LIMITED" : "READY",
    additional: { saytwist: saytwistAdditional, source: sourceAdditional },
  };
}
