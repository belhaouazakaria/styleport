/**
 * Phase 14K: pure, advisory creative portfolio planner.
 *
 * Does not enqueue Growth jobs, create images, mutate account settings,
 * call Pinterest or approve/publish Pins. All runtime connections and quota
 * counters must be supplied from trusted server-side persisted evidence.
 */
export type PortfolioIntent = "UTILITY" | "INSPIRATION" | "PLAYGROUND" | "SPECIALIST";
export type DestinationKind = "TRANSLATOR" | "IDEA";
export type CreativeAngle =
  | "TOOL_DEMONSTRATION"
  | "SAVEABLE_EDITORIAL"
  | "PLAYFUL_INTERACTION"
  | "SPECIALIST_EXPLAINER";

export type AccountCreativeProfile = {
  key: string;
  label: string;
  intent: PortfolioIntent;
  angle: CreativeAngle;
  dailyCandidateCap: number;
  connectedAccountId: string | null;
  connectionHealthy: boolean;
  preparationEnabled: boolean;
};

export type CreativeOpportunityEvidence = {
  id: string;
  topicKey: string;
  editorialAngleKey: string;
  targetKind: DestinationKind;
  targetId: string;
  intent: PortfolioIntent;
  score: number;
  confidence: number;
  evidenceState: "KNOWN" | "PARTIAL" | "UNKNOWN";
  original: boolean;
};

export type CandidatePreparationProposal = {
  accountId: string;
  accountKey: string;
  opportunityId: string;
  targetKind: DestinationKind;
  targetId: string;
  angle: CreativeAngle;
  intent: PortfolioIntent;
  topicKey: string;
  editorialAngleKey: string;
  state: "PLANNED_FOR_REVIEW";
  requiresExactPinApproval: true;
};

export type PortfolioDailyBudget = {
  maxCandidatesPerDay: number;
  candidatesAlreadyCreated: number;
  createdByAccount: Readonly<Record<string, number>>;
};

export const INITIAL_CREATIVE_PORTFOLIO = [
  {
    key: "saytwist",
    label: "SayTwist",
    intent: "UTILITY",
    angle: "TOOL_DEMONSTRATION",
    dailyCandidateCap: 0,
    connectedAccountId: null,
    connectionHealthy: false,
    preparationEnabled: false,
  },
  {
    key: "saytwist-ideas",
    label: "SayTwist Ideas",
    intent: "INSPIRATION",
    angle: "SAVEABLE_EDITORIAL",
    dailyCandidateCap: 2,
    connectedAccountId: null,
    connectionHealthy: false,
    preparationEnabled: false,
  },
  {
    key: "saytwist-playground",
    label: "SayTwist Playground",
    intent: "PLAYGROUND",
    angle: "PLAYFUL_INTERACTION",
    dailyCandidateCap: 2,
    connectedAccountId: null,
    connectionHealthy: false,
    preparationEnabled: false,
  },
] as const satisfies readonly AccountCreativeProfile[];

export const DEFAULT_DAILY_CANDIDATE_CAP = 4;
// Existing owner-approved hard ceilings are enforced by separate runtime
// provider/content quota modules. This planner must never loosen them.
export const EXISTING_DAILY_AI_IMAGE_CAP = 3;
export const EXISTING_DAILY_TRANSLATOR_CREATE_CAP = 1;

function boundedInteger(n: number, max: number) {
  return Number.isSafeInteger(n) && n >= 0 && n <= max;
}

function validKey(value: string) {
  return /^[a-z0-9][a-z0-9-]{0,62}$/.test(value);
}

function normalKey(value: string) {
  return value.trim().toLowerCase();
}

function angleAllowed(intent: PortfolioIntent, angle: CreativeAngle) {
  return (
    (intent === "UTILITY" && angle === "TOOL_DEMONSTRATION") ||
    (intent === "INSPIRATION" && angle === "SAVEABLE_EDITORIAL") ||
    (intent === "PLAYGROUND" && angle === "PLAYFUL_INTERACTION") ||
    (intent === "SPECIALIST" && angle === "SPECIALIST_EXPLAINER")
  );
}

/** Future connected profiles can be supplied without assuming three roles. */
export function planAccountCreativeCandidates(input: {
  profiles: readonly AccountCreativeProfile[];
  opportunities: readonly CreativeOpportunityEvidence[];
  budget: PortfolioDailyBudget;
}): CandidatePreparationProposal[] {
  const { profiles, opportunities, budget } = input;
  if (!boundedInteger(budget.maxCandidatesPerDay, 50) ||
      !boundedInteger(budget.candidatesAlreadyCreated, 1_000_000) ||
      profiles.length > 30 || opportunities.length > 500) {
    throw Error("PORTFOLIO_INPUT_INVALID");
  }
  const seenProfileKeys = new Set<string>();
  const seenConnectedIds = new Set<string>();
  for (const profile of profiles) {
    if (!validKey(profile.key) || seenProfileKeys.has(profile.key) ||
        profile.label.trim().length < 2 || profile.label.length > 80 ||
        !boundedInteger(profile.dailyCandidateCap, 20) ||
        !angleAllowed(profile.intent, profile.angle)) {
      throw Error("PORTFOLIO_PROFILE_INVALID");
    }
    seenProfileKeys.add(profile.key);
    if (profile.connectedAccountId !== null) {
      if (!/^[a-zA-Z0-9_-]{1,64}$/.test(profile.connectedAccountId) ||
          seenConnectedIds.has(profile.connectedAccountId)) {
        throw Error("PORTFOLIO_ACCOUNT_DUPLICATE");
      }
      seenConnectedIds.add(profile.connectedAccountId);
    }
    const already = budget.createdByAccount[profile.key] ?? 0;
    if (!boundedInteger(already, 1_000_000)) {
      throw Error("PORTFOLIO_ACCOUNT_COUNT_INVALID");
    }
  }
  const ordered = [...opportunities].sort(
    (a, b) => b.score - a.score || b.confidence - a.confidence ||
      a.id.localeCompare(b.id),
  );
  const seenOpportunities = new Set<string>();
  for (const opportunity of ordered) {
    if (!validKey(opportunity.id) || seenOpportunities.has(opportunity.id) ||
        !validKey(opportunity.topicKey) ||
        !validKey(opportunity.editorialAngleKey) ||
        !/^[a-zA-Z0-9_-]{1,64}$/.test(opportunity.targetId) ||
        !Number.isFinite(opportunity.score) ||
        opportunity.score < 0 || opportunity.score > 100 ||
        !Number.isFinite(opportunity.confidence) ||
        opportunity.confidence < 0 || opportunity.confidence > 100) {
      throw Error("PORTFOLIO_OPPORTUNITY_INVALID");
    }
    seenOpportunities.add(opportunity.id);
  }
  const remainingGlobal = Math.max(
    0, budget.maxCandidatesPerDay - budget.candidatesAlreadyCreated,
  );
  const proposals: CandidatePreparationProposal[] = [];
  const alreadyProposed = new Set<string>();
  const visualIdentityUsed = new Set<string>();
  for (const profile of profiles) {
    if (!profile.preparationEnabled || !profile.connectionHealthy ||
        !profile.connectedAccountId || remainingGlobal === 0) continue;
    const used = budget.createdByAccount[profile.key] ?? 0;
    const remaining = Math.min(
      Math.max(0, profile.dailyCandidateCap - used),
      remainingGlobal - proposals.length,
    );
    let count = 0;
    for (const opportunity of ordered) {
      if (count >= remaining) break;
      if (opportunity.intent !== profile.intent ||
          opportunity.evidenceState !== "KNOWN" ||
          opportunity.confidence < 80 || opportunity.score < 70 ||
          !opportunity.original) continue;
      if (profile.intent === "UTILITY" &&
          opportunity.targetKind !== "TRANSLATOR") continue;
      if (profile.intent === "INSPIRATION" &&
          opportunity.targetKind !== "IDEA") continue;

      const key = profile.key + ":" + opportunity.targetKind + ":" +
        opportunity.targetId + ":" + normalKey(opportunity.editorialAngleKey);
      // A topic may be reused across publications only with a genuinely
      // distinct editorial angle, not a superficial recolor/repost.
      const identity = opportunity.topicKey + ":" +
        normalKey(opportunity.editorialAngleKey);
      if (alreadyProposed.has(key) || visualIdentityUsed.has(identity)) continue;
      alreadyProposed.add(key);
      visualIdentityUsed.add(identity);
      proposals.push({
        accountId: profile.connectedAccountId,
        accountKey: profile.key,
        opportunityId: opportunity.id,
        targetKind: opportunity.targetKind,
        targetId: opportunity.targetId,
        angle: profile.angle,
        intent: profile.intent,
        topicKey: opportunity.topicKey,
        editorialAngleKey: opportunity.editorialAngleKey,
        state: "PLANNED_FOR_REVIEW",
        requiresExactPinApproval: true,
      });
      count++;
    }
  }
  return proposals;
}

export type AccountExpansionSignal = {
  suggestedKey: string;
  suggestedName: string;
  editorialIdentity: string;
  observationDays: number;
  publishedContentCount: number;
  distinctConceptCount: number;
  qualifiedConversions: number | null;
  confidence: number;
  strongestPinSharePercent: number | null;
  distinctFromExistingAccounts: boolean;
  performanceAbovePortfolioBaseline: boolean | null;
};

export type AccountExpansionAdvice =
  | { action: "WAIT"; reason: string }
  | { action: "RECOMMEND_OWNER_REVIEW"; suggestedKey: string; suggestedName: string;
      editorialIdentity: string; evidenceConfidence: number; createAutomatically: false };

/** Data-driven monthly advice only; never creates a Pinterest account. */
export function recommendAccountExpansion(input: {
  profiles: readonly AccountCreativeProfile[];
  signal: AccountExpansionSignal | null;
}): AccountExpansionAdvice {
  const mandatoryKeys = ["saytwist", "saytwist-ideas", "saytwist-playground"];
  if (!mandatoryKeys.every(key =>
    input.profiles.some(profile =>
      profile.key === key && !!profile.connectedAccountId &&
      profile.connectionHealthy))) {
    return { action: "WAIT", reason: "COMPLETE_THREE_ACCOUNT_BASELINE" };
  }
  const s = input.signal;
  if (!s) return { action: "WAIT", reason: "NO_EXPANSION_EVIDENCE" };
  if (!validKey(s.suggestedKey) ||
      input.profiles.some(p => p.key === s.suggestedKey) ||
      s.suggestedName.trim().length < 3 || s.suggestedName.length > 80 ||
      s.editorialIdentity.trim().length < 20 ||
      s.editorialIdentity.length > 250 ||
      !boundedInteger(s.observationDays, 365) ||
      !boundedInteger(s.publishedContentCount, 1_000_000) ||
      !boundedInteger(s.distinctConceptCount, 1_000_000) ||
      (s.qualifiedConversions !== null &&
        !boundedInteger(s.qualifiedConversions, 1_000_000)) ||
      !Number.isFinite(s.confidence) || s.confidence < 0 || s.confidence > 100 ||
      (s.strongestPinSharePercent !== null &&
        (!Number.isFinite(s.strongestPinSharePercent) ||
         s.strongestPinSharePercent < 0 || s.strongestPinSharePercent > 100))) {
    return { action: "WAIT", reason: "INVALID_EXPANSION_SIGNAL" };
  }
  // Draft heuristic for future review; not enabled as an automated account
  // creation decision. Unknown conversions/portfolio baseline never count 0.
  if (s.observationDays < 28 || s.publishedContentCount < 20 ||
      s.distinctConceptCount < 6 || s.qualifiedConversions === null ||
      s.qualifiedConversions < 10 || s.confidence < 80 ||
      s.strongestPinSharePercent === null ||
      s.strongestPinSharePercent > 40 ||
      !s.distinctFromExistingAccounts ||
      s.performanceAbovePortfolioBaseline !== true) {
    return { action: "WAIT", reason: "SUSTAINED_DISTINCT_EVIDENCE_REQUIRED" };
  }
  return {
    action: "RECOMMEND_OWNER_REVIEW",
    suggestedKey: s.suggestedKey,
    suggestedName: s.suggestedName,
    editorialIdentity: s.editorialIdentity,
    evidenceConfidence: s.confidence,
    createAutomatically: false,
  };
}
