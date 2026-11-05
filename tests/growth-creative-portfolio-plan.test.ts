import { describe, expect, it } from "vitest";
import {
  DEFAULT_DAILY_CANDIDATE_CAP,
  EXISTING_DAILY_AI_IMAGE_CAP,
  EXISTING_DAILY_TRANSLATOR_CREATE_CAP,
  INITIAL_CREATIVE_PORTFOLIO,
  planAccountCreativeCandidates,
  recommendAccountExpansion,
  type AccountCreativeProfile,
  type CreativeOpportunityEvidence,
} from "@/lib/growth/portfolio/creative-plan";

const connected = INITIAL_CREATIVE_PORTFOLIO.map((p, i) => ({
  ...p,
  connectedAccountId: "account_" + i,
  connectionHealthy: true,
  preparationEnabled: true,
})) as AccountCreativeProfile[];

const evidence: CreativeOpportunityEvidence[] = [
  { id: "savea", topicKey: "messages", editorialAngleKey: "saveable-replies",
    targetKind: "IDEA", targetId: "idea1", intent: "INSPIRATION",
    evidenceState: "KNOWN", original: true, score: 98, confidence: 95 },
  { id: "saveb", topicKey: "captions", editorialAngleKey: "caption-list",
    targetKind: "IDEA", targetId: "idea2", intent: "INSPIRATION",
    evidenceState: "KNOWN", original: true, score: 94, confidence: 87 },
  { id: "playa", topicKey: "messages", editorialAngleKey: "choose-a-reply",
    targetKind: "TRANSLATOR", targetId: "translator1", intent: "PLAYGROUND",
    evidenceState: "KNOWN", original: true, score: 90, confidence: 98 },
  { id: "playb", topicKey: "persona", editorialAngleKey: "voice-game",
    targetKind: "TRANSLATOR", targetId: "translator2", intent: "PLAYGROUND",
    evidenceState: "KNOWN", original: true, score: 84, confidence: 82 },
];

const budget = {
  maxCandidatesPerDay: DEFAULT_DAILY_CANDIDATE_CAP,
  candidatesAlreadyCreated: 0,
  createdByAccount: {},
};

describe("Phase14K account intent portfolio, advisory only", () => {
  it("preserves existing money/content guard ceilings and no connected defaults", () => {
    expect(DEFAULT_DAILY_CANDIDATE_CAP).toBe(10);
    expect(EXISTING_DAILY_AI_IMAGE_CAP).toBe(3);
    expect(EXISTING_DAILY_TRANSLATOR_CREATE_CAP).toBe(1);
    expect(planAccountCreativeCandidates({
      profiles: INITIAL_CREATIVE_PORTFOLIO,
      opportunities: evidence, budget,
    })).toEqual([]);
  });

  it("proposes different account-specific creative angles and destinations", () => {
    const result = planAccountCreativeCandidates({
      profiles: connected,
      opportunities: evidence,
      budget,
    });
    expect(result).toHaveLength(4);
    expect(result.map(x => x.accountKey)).toEqual([
      "saytwist-ideas", "saytwist-playground",
      "saytwist-ideas", "saytwist-playground",
    ]);
    expect(result.filter(x => x.accountKey === "saytwist-ideas").every(x =>
      x.angle === "SAVEABLE_EDITORIAL" && x.targetKind === "IDEA" &&
      x.visualStyleKey === "warm-editorial-v1")).toBe(true);
    expect(result.filter(x => x.accountKey === "saytwist-playground").every(x =>
      x.angle === "PLAYFUL_INTERACTION" &&
      x.visualStyleKey === "playful-bold-v1" &&
      x.targetKind === "TRANSLATOR")).toBe(true);
    expect(result.every(x =>
      x.requiresExactPinApproval && x.state === "PLANNED_FOR_REVIEW")).toBe(true);
  });

  it("does not fill quotas when evidence is stale, weak or not original", () => {
    const altered = evidence.map(x => ({
      ...x, evidenceState: "PARTIAL" as const, original: false, confidence: 10,
    }));
    expect(planAccountCreativeCandidates({
      profiles: connected, opportunities: altered, budget,
    })).toEqual([]);
  });

  it("respects per-account existing candidates and global daily ceiling", () => {
    const result = planAccountCreativeCandidates({
      profiles: connected, opportunities: evidence,
      budget: {
        maxCandidatesPerDay: 4,
        candidatesAlreadyCreated: 2,
        createdByAccount: { "saytwist-ideas": 1 },
      },
    });
    expect(result).toHaveLength(2);
    expect(result.map(x => x.accountKey)).toEqual([
      "saytwist-ideas", "saytwist-playground",
    ]);
    expect(planAccountCreativeCandidates({
      profiles: connected, opportunities: evidence,
      budget: { maxCandidatesPerDay: 4, candidatesAlreadyCreated: 4,
        createdByAccount: {} },
    })).toEqual([]);
  });

  it("does not repeat an editorial concept across accounts", () => {
    const similar = {
      ...evidence[2],
      id: "clone",
      intent: "PLAYGROUND" as const,
      topicKey: "messages",
      editorialAngleKey: "saveable-replies",
      score: 99,
    };
    const results = planAccountCreativeCandidates({
      profiles: connected,
      opportunities: [similar, ...evidence], budget,
    });
    const topicAngleKeys = results.map(x => x.topicKey + ":" + x.editorialAngleKey);
    expect(new Set(topicAngleKeys).size).toBe(results.length);
    expect(results.find(x => x.opportunityId === "clone")).toBeUndefined();
  });

  it("supports a fourth account profile without creating any Pinterest account", () => {
    const specialist: AccountCreativeProfile = {
      key: "saytwist-texting", label: "SayTwist Texting",
      intent: "SPECIALIST", angle: "SPECIALIST_EXPLAINER",
      visualStyleKey: "texting-explainer-v1",
      dailyCandidateCap: 1, connectedAccountId: "existing_texting_account",
      connectionHealthy: true, preparationEnabled: true,
    };
    const results = planAccountCreativeCandidates({
      profiles: [...connected, specialist],
      opportunities: [...evidence, {
        id: "texts", topicKey: "texting", editorialAngleKey: "explain-texts",
        targetKind: "IDEA", targetId: "idea3", intent: "SPECIALIST",
        evidenceState: "KNOWN", original: true, score: 93, confidence: 97,
      }],
      budget: { maxCandidatesPerDay: 5,
        candidatesAlreadyCreated: 0, createdByAccount: {} },
    });
    expect(results).toHaveLength(5);
    expect(results.find(x => x.accountKey === "saytwist-texting")).toMatchObject({
      accountKey: "saytwist-texting", accountId: "existing_texting_account",
      requiresExactPinApproval: true,
    });
  });

  it("rejects duplicate account bindings and malformed counts", () => {
    expect(() => planAccountCreativeCandidates({
      profiles: [...connected, { ...connected[0], key: "duplicate",
        visualStyleKey: "duplicate-style" }],
      opportunities: evidence, budget,
    })).toThrow("PORTFOLIO_ACCOUNT_DUPLICATE");
    expect(() => planAccountCreativeCandidates({
      profiles: connected, opportunities: evidence,
      budget: { ...budget, candidatesAlreadyCreated: -1 },
    })).toThrow("PORTFOLIO_INPUT_INVALID");
  });
});

const expansion = {
  suggestedKey: "saytwist-texting",
  suggestedName: "SayTwist Texting",
  editorialIdentity: "Text message examples, interpretation, and response ideas",
  observationDays: 28,
  publishedContentCount: 40,
  distinctConceptCount: 12,
  qualifiedConversions: 40,
  confidence: 91,
  strongestPinSharePercent: 23,
  distinctFromExistingAccounts: true,
  performanceAbovePortfolioBaseline: true,
};

describe("Phase14K monthly expansion advice", () => {
  it("finishes the initial three-account baseline first", () => {
    expect(recommendAccountExpansion({
      profiles: INITIAL_CREATIVE_PORTFOLIO, signal: expansion,
    })).toEqual({
      action: "WAIT", reason: "COMPLETE_THREE_ACCOUNT_BASELINE",
    });
  });

  it("does not infer zero conversions when attribution is off", () => {
    expect(recommendAccountExpansion({
      profiles: connected,
      signal: { ...expansion, qualifiedConversions: null },
    })).toEqual({
      action: "WAIT", reason: "SUSTAINED_DISTINCT_EVIDENCE_REQUIRED",
    });
  });

  it("rejects overlapping accounts and anomalous one-Pin concentration", () => {
    expect(recommendAccountExpansion({
      profiles: connected,
      signal: { ...expansion, distinctFromExistingAccounts: false },
    }).action).toBe("WAIT");
    expect(recommendAccountExpansion({
      profiles: connected,
      signal: { ...expansion, strongestPinSharePercent: 92 },
    }).action).toBe("WAIT");
  });

  it("produces only a proposal for owner review from sustained evidence", () => {
    expect(recommendAccountExpansion({
      profiles: connected, signal: expansion,
    })).toEqual({
      action: "RECOMMEND_OWNER_REVIEW",
      suggestedKey: expansion.suggestedKey,
      suggestedName: expansion.suggestedName,
      editorialIdentity: expansion.editorialIdentity,
      evidenceConfidence: expansion.confidence,
      createAutomatically: false,
    });
  });
});
