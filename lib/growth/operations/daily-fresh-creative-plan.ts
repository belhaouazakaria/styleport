import { dailyCadenceChannelSchema, type CadenceChannelPolicy } from "@/lib/growth/portfolio/daily-cadence";

/** Initial safe deterministic rollout, independently capped below the owner's 10/day ceiling. */
export const FRESH_CREATIVE_DAILY_HARD_CAP = 3;

export type FreshCreativePlan = {
  desired: number;
  additional: number;
  status: "READY" | "PAUSED" | "SATISFIED" | "NO_QUALIFIED_TARGET";
  model: "evidence-guided" | "one-exploration" | "owner-fixed" | "paused";
};

/**
 * Fresh creative preparation creates drafts for review, NEVER publishing Pins.
 * AUTO explores one qualified original target while first-party evidence is
 * insufficient. It only ramps to three if a recent, fully KNOWN opportunity
 * analysis exists; FIXED is an owner's explicit higher target, still max three.
 */
export function planDailyFreshCreatives(input: {
  policy: CadenceChannelPolicy;
  alreadyCreatedToday: number;
  eligibleDistinctTargets: number;
  verifiedRecentOpportunityEvidence: boolean;
}): FreshCreativePlan {
  const { policy, alreadyCreatedToday, eligibleDistinctTargets,
    verifiedRecentOpportunityEvidence } = input;
  const owner = dailyCadenceChannelSchema.parse(policy);
  for (const count of [alreadyCreatedToday, eligibleDistinctTargets]) {
    if (!Number.isSafeInteger(count) || count < 0 || count > 1_000_000) {
      throw Error("FRESH_CREATIVE_RESOURCE_INVALID");
    }
  }
  if (owner.mode === "PAUSED") {
    return { desired: 0, additional: 0, status: "PAUSED", model: "paused" };
  }
  const desired = Math.min(
    FRESH_CREATIVE_DAILY_HARD_CAP, owner.maximum,
    owner.mode === "FIXED" ? owner.fixed! :
      verifiedRecentOpportunityEvidence ? Math.max(owner.minimum, 3) : 1,
  );
  const stillNeeded = Math.max(0, desired - alreadyCreatedToday);
  if (stillNeeded === 0) {
    return { desired, additional: 0, status: "SATISFIED",
      model: owner.mode === "FIXED" ? "owner-fixed" :
        verifiedRecentOpportunityEvidence ? "evidence-guided" : "one-exploration" };
  }
  const additional = Math.min(stillNeeded, eligibleDistinctTargets);
  return {
    desired,
    additional,
    status: additional ? "READY" : "NO_QUALIFIED_TARGET",
    model: owner.mode === "FIXED" ? "owner-fixed" :
      verifiedRecentOpportunityEvidence ? "evidence-guided" : "one-exploration",
  };
}
