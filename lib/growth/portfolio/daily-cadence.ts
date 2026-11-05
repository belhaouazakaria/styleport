import { z } from "zod";

/**
 * Phase 14K autonomous cadence proposal. Pure/read-only; not a job launcher.
 * Daily limits are UTC, and counts are supplied from trusted DB-backed queries.
 * The planning minimum is a preferred floor, never a permission to bypass
 * safety gates, quality, account availability, budget or exact Pin approval.
 */
export const dailyCadenceChannelSchema = z.object({
  mode: z.enum(["AUTO", "FIXED", "PAUSED"]),
  minimum: z.number().int().min(1).max(10),
  maximum: z.number().int().min(1).max(10),
  fixed: z.number().int().min(1).max(10).nullable(),
}).strict().superRefine((v, ctx) => {
  if (v.minimum > v.maximum) ctx.addIssue({
    code: "custom", path: ["minimum"],
    message: "The minimum must not exceed the maximum.",
  });
  if (v.mode === "FIXED") {
    if (v.fixed === null || v.fixed < v.minimum || v.fixed > v.maximum)
      ctx.addIssue({ code: "custom", path: ["fixed"],
        message: "Fixed count must be inside the allowed range." });
  } else if (v.fixed !== null) {
    ctx.addIssue({ code: "custom", path: ["fixed"],
      message: "Only FIXED mode may specify a fixed count." });
  }
});

export const dailyCadencePolicySchema = z.object({
  pinCreatives: dailyCadenceChannelSchema,
  translatorCreates: dailyCadenceChannelSchema,
}).strict();

export type DailyCadencePolicy = z.infer<typeof dailyCadencePolicySchema>;
export type CadenceChannelPolicy = z.infer<typeof dailyCadenceChannelSchema>;
export type CadencePerformance = "WEAK" | "NORMAL" | "STRONG" | "UNKNOWN";

export const DEFAULT_DAILY_CADENCE_POLICY: DailyCadencePolicy = {
  pinCreatives: { mode: "AUTO", minimum: 1, maximum: 10, fixed: null },
  translatorCreates: { mode: "AUTO", minimum: 1, maximum: 10, fixed: null },
};

export type CadenceResources = {
  /** Qualifying source ideas AFTER relevance, originality and target checks. */
  eligibleOpportunities: number;
  performance: CadencePerformance;
  /** Daily authorized channel cap, independent of the owner's desired range. */
  authorizedDailyLimit: number;
  /** Committed output already created in the current UTC day. */
  completedToday: number;
  /** Reserved/pending work not yet counted as completed. */
  pendingToday: number;
  /** Conservative admission based on hard cash/provider reservation budgets. */
  budgetedAdditionalCapacity: number;
  /** Connected, healthy account and platform execution gates. */
  operationallyReady: boolean;
};

export type CadenceDecision = {
  requestedToday: number;
  additionalPlanned: number;
  alreadyCommitted: number;
  mode: CadenceChannelPolicy["mode"];
  status: "READY" | "LIMITED" | "PAUSED" | "BLOCKED" | "SATISFIED";
  reasons: string[];
};

function positiveInt(n: number) {
  return Number.isSafeInteger(n) && n >= 0 && n <= 1_000_000;
}

/**
 * Deterministic autonomous target: use opportunity depth and performance to
 * select a nonzero desired amount. Missing evidence is NOT a weak score.
 */
function preferredCount(policy: CadenceChannelPolicy, resources: CadenceResources) {
  if (policy.mode === "PAUSED") return 0;
  if (policy.mode === "FIXED") return policy.fixed!;
  if (resources.performance === "UNKNOWN") return policy.minimum;
  const demand = resources.eligibleOpportunities;
  const multiplier = resources.performance === "STRONG" ? 1 :
    resources.performance === "NORMAL" ? 0.7 : 0.4;
  return Math.max(policy.minimum, Math.min(policy.maximum,
    Math.ceil(demand * multiplier)));
}

export function decideDailyChannelCadence(
  raw: CadenceChannelPolicy, resources: CadenceResources,
): CadenceDecision {
  const policy = dailyCadenceChannelSchema.parse(raw);
  for (const value of [
    resources.eligibleOpportunities, resources.authorizedDailyLimit,
    resources.completedToday, resources.pendingToday,
    resources.budgetedAdditionalCapacity,
  ]) if (!positiveInt(value)) throw Error("CADENCE_RESOURCE_INVALID");

  const committed = resources.completedToday + resources.pendingToday;
  if (!Number.isSafeInteger(committed)) throw Error("CADENCE_RESOURCE_INVALID");
  if (policy.mode === "PAUSED") return {
    requestedToday: 0, additionalPlanned: 0,
    alreadyCommitted: committed, mode: policy.mode,
    status: "PAUSED", reasons: ["OWNER_PAUSED"],
  };
  const requested = preferredCount(policy, resources);
  const reasons: string[] = [];
  if (!resources.operationallyReady) reasons.push("OPERATION_NOT_READY");
  if (resources.eligibleOpportunities === 0) reasons.push("NO_QUALIFIED_OPPORTUNITIES");
  if (resources.performance === "UNKNOWN") reasons.push("PERFORMANCE_UNVERIFIED");
  const desiredAdditional = Math.max(0, requested - committed);
  if (desiredAdditional > 0 && resources.budgetedAdditionalCapacity === 0) reasons.push("BUDGET_OR_PROVIDER_CAP");
  if (desiredAdditional > 0 && committed >= resources.authorizedDailyLimit) reasons.push("AUTHORIZED_DAILY_CAP");
  const additional = resources.operationallyReady &&
    resources.performance !== "UNKNOWN" ?
    Math.min(desiredAdditional, resources.eligibleOpportunities,
      Math.max(0, resources.authorizedDailyLimit - committed),
      resources.budgetedAdditionalCapacity) : 0;
  if (additional < desiredAdditional) reasons.push("TARGET_NOT_FULLY_FEASIBLE");
  return {
    requestedToday: requested,
    additionalPlanned: additional,
    alreadyCommitted: committed,
    mode: policy.mode,
    status: desiredAdditional === 0 ? "SATISFIED" :
      additional === 0 ? "BLOCKED" :
      additional < desiredAdditional ? "LIMITED" : "READY",
    reasons: [...new Set(reasons)],
  };
}

export type DailyCadenceEvidence = {
  pinCreatives: CadenceResources;
  translatorCreates: CadenceResources;
  /** Independently approved, due Pin publications; never generated from target. */
  individuallyApprovedPinsDue: number;
  publishedPinsToday: number;
  /** Published Translator pages require a separate reviewed activation path. */
  translatorPublishGateEnabled: boolean;
  qualityApprovedTranslatorsReady: number;
  publishedTranslatorsToday: number;
};

export type DailyCadencePlan = {
  pinCreativePlanning: CadenceDecision;
  translatorCreationPlanning: CadenceDecision;
  /** Explicit per-Pin approval remains required for every publication. */
  eligiblePinPublications: number;
  /** Zero unless separate page-publication gate and quality evidence are ready. */
  eligibleTranslatorPublications: number;
  publishingAutomaticallyAuthorizesPins: false;
  productionExecutionAuthorized: false;
};

export function planDailyGrowthCadence(
  policy: DailyCadencePolicy,
  evidence: DailyCadenceEvidence,
): DailyCadencePlan {
  const config = dailyCadencePolicySchema.parse(policy);
  for (const value of [
    evidence.individuallyApprovedPinsDue,
    evidence.publishedPinsToday,
    evidence.qualityApprovedTranslatorsReady,
    evidence.publishedTranslatorsToday,
  ]) if (!positiveInt(value)) throw Error("CADENCE_PUBLICATION_INVALID");

  const pinCreativePlanning = decideDailyChannelCadence(
    config.pinCreatives, evidence.pinCreatives,
  );
  const translatorCreationPlanning = decideDailyChannelCadence(
    config.translatorCreates, evidence.translatorCreates,
  );

  return {
    pinCreativePlanning,
    translatorCreationPlanning,
    eligiblePinPublications: config.pinCreatives.mode === "PAUSED" ? 0 :
      Math.min(evidence.individuallyApprovedPinsDue,
        Math.max(0, config.pinCreatives.maximum -
          evidence.publishedPinsToday)),
    eligibleTranslatorPublications: !evidence.translatorPublishGateEnabled ||
      config.translatorCreates.mode === "PAUSED" ? 0 :
      Math.min(evidence.qualityApprovedTranslatorsReady,
        Math.max(0, config.translatorCreates.maximum -
          evidence.publishedTranslatorsToday)),
    publishingAutomaticallyAuthorizesPins: false,
    productionExecutionAuthorized: false,
  };
}
