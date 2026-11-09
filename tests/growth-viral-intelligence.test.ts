import { describe, expect, it } from "vitest";
import {
  DEFAULT_VIRAL_PORTFOLIO_POLICY, planViralPortfolio,
} from "@/lib/growth/viral/portfolio";
import {
  DEFAULT_VIRAL_WINNER_POLICY, evaluateViralWinner,
} from "@/lib/growth/viral/winners";
import {
  normalizeTranslatorConcept, planNicheExpansion,
} from "@/lib/growth/viral/niche";

const evidence = {
  day: "2026-11-09", saytwistCommitted: 0, sourceCommitted: 0,
  hardDailyPinCap: 3, remainingProviderPublicationCapacity: 3,
  sourceConceptsQualified: 6, originalConceptsQualified: 6,
  sourcePublishingRightsVerified: true,
};

describe("Growth Viral Intelligence: dual-channel portfolio", () => {
  it("is default-off despite historical existing Growth timers being active", () => {
    expect(planViralPortfolio(DEFAULT_VIRAL_PORTFOLIO_POLICY, evidence)).toMatchObject({
      status: "PAUSED", additional: { saytwist: 0, source: 0 },
      pinPublicationAutomaticallyApproved: false,
      destinationRewritesAuthorized: false,
    });
  });
  it("splits an odd 3-Pin budget across two UTC dates without increasing quota", () => {
    const policy = { mode: "ACTIVE" as const, sourceSharePercent: 50, maxPinsPerDay: 3 };
    const first = planViralPortfolio(policy, evidence);
    const next = planViralPortfolio(policy, { ...evidence, day: "2026-11-10" });
    expect(first.target.source + first.target.saytwist).toBe(3);
    expect(next.target.source + next.target.saytwist).toBe(3);
    expect(first.target.source + next.target.source).toBe(3);
    expect(first.additional.source + first.additional.saytwist).toBe(3);
    expect(next.additional.source + next.additional.saytwist).toBe(3);
  });
  it("accounts for already approved and in-flight work, hard caps and no source rights", () => {
    const policy = { mode: "ACTIVE" as const, sourceSharePercent: 50, maxPinsPerDay: 10 };
    const r = planViralPortfolio(policy, {
      ...evidence, hardDailyPinCap: 3, sourcePublishingRightsVerified: false,
      saytwistCommitted: 1, sourceCommitted: 1,
    });
    expect(r.additional.source).toBe(0);
    expect(r.additional.saytwist).toBeLessThanOrEqual(1);
    expect(r.reasons).toContain("SOURCE_RIGHTS_UNVERIFIED");
    expect(planViralPortfolio(policy, { ...evidence, hardDailyPinCap: 1,
      remainingProviderPublicationCapacity: 0 }).additional).toEqual({ saytwist: 0, source: 0 });
  });
  it("never turns owner review mode into publishing permission", () => {
    const policy = { mode: "REVIEW" as const, sourceSharePercent: 50, maxPinsPerDay: 3 };
    expect(planViralPortfolio(policy, evidence).additional)
      .toEqual({ saytwist: 0, source: 0 });
  });
  it("rejects malformed numbers and UTC dates", () => {
    expect(() => planViralPortfolio({ mode: "ACTIVE", maxPinsPerDay: 11,
      sourceSharePercent: 50 }, evidence)).toThrow();
    expect(() => planViralPortfolio({ mode: "ACTIVE", maxPinsPerDay: 3,
      sourceSharePercent: 50 }, { ...evidence, day: "2026-02-29" })).toThrow();
    expect(() => planViralPortfolio({ mode: "ACTIVE", maxPinsPerDay: 3,
      sourceSharePercent: 50 }, { ...evidence, sourceCommitted: -1 })).toThrow();
  });
});

const now = new Date("2026-11-09T12:00:00.000Z");
const good = {
  impressions: 3000, saves: 180, outboundClicks: 90,
  measuredAt: new Date("2026-11-09T08:00:00.000Z"),
  publishedAt: new Date("2026-11-02T09:00:00.000Z"),
  baselineSaveRate: 0.018, baselineOutboundRate: 0.01,
  pinterestDataStatus: "READY" as const,
};

describe("Growth Viral Intelligence: evidence-first winners", () => {
  it("requires both mature exposure and meaningful lift versus owned baseline", () => {
    expect(evaluateViralWinner(good, now)).toMatchObject({
      status: "WINNER", recommendedAction: "PREPARE_ORIGINAL_TRANSLATOR_AND_NICHE",
    });
    expect(evaluateViralWinner({ ...good, saves: 14, outboundClicks: 7 }, now).status)
      .toBe("NOT_WINNING");
  });
  it("fails closed on missing, processing, outdated, too-new or missing baseline data", () => {
    expect(evaluateViralWinner({ ...good, pinterestDataStatus: "PROCESSING" }, now).status)
      .toBe("INSUFFICIENT_DATA");
    expect(evaluateViralWinner({ ...good, measuredAt: new Date("2026-10-01") }, now).status)
      .toBe("INSUFFICIENT_DATA");
    expect(evaluateViralWinner({ ...good, publishedAt: new Date("2026-11-08") }, now).status)
      .toBe("INSUFFICIENT_DATA");
    expect(evaluateViralWinner({ ...good, baselineSaveRate: null }, now).status)
      .toBe("INSUFFICIENT_DATA");
    expect(evaluateViralWinner({ ...good, impressions: null }, now).status)
      .toBe("INSUFFICIENT_DATA");
    expect(evaluateViralWinner({ ...good, outboundClicks: 4000 }, now).status)
      .toBe("INSUFFICIENT_DATA");
  });
  it("does not confuse clicks with impressions or derive authority from a third-party domain", () => {
    const result = evaluateViralWinner(good, now, DEFAULT_VIRAL_WINNER_POLICY);
    expect(result.outboundRate).toBeCloseTo(0.03);
    expect(result.saveLift).toBeCloseTo(0.06 / 0.018);
  });
});

describe("Growth Viral Intelligence: original niche expansion", () => {
  const related = [
    { title: "Medieval English Translator",
      intent: "Rephrase ordinary English in an accessible medieval-inspired register",
      relationship: "ADJACENT" as const,
      evidence: "Shared historical-language interest and a distinct audience need" },
    { title: "Royal English Translator",
      intent: "Rephrase contemporary messages in ceremonial English wording",
      relationship: "STYLE_VARIATION" as const,
      evidence: "Adjacent formal speech niche with a distinct functional outcome" },
  ];
  it("deduplicates related ideas and never publishes automatically", () => {
    expect(normalizeTranslatorConcept("Royal-English Translator!"))
      .toBe(normalizeTranslatorConcept("royal english tool"));
    const result = planNicheExpansion("Shakespeare Translator",
      [...related, related[0]], ["Victorian English Translator"], 2);
    expect(result.suggestions.map(x => x.normalizedKey))
      .toEqual(["medieval english", "royal english"]);
    expect(result.requiresOriginalGeneration).toBe(true);
    expect(result.translatorPublicationAuthorized).toBe(false);
    expect(result.pinterestPublicationAuthorized).toBe(false);
  });
  it("rejects thin keyword swaps, invalid proposals and excessive batch sizes", () => {
    const invalid = { ...related[0], title: "Shakespeare Style Translator" };
    const result = planNicheExpansion("Shakespeare Translator", [invalid,
      { ...related[0], title: "Medieval English Tool" }, related[0], {}], [], 2);
    expect(result.suggestions).toHaveLength(1);
    expect(result.skipped).toContain("DUPLICATE_OR_THIN_VARIATION");
    expect(result.skipped).toContain("INVALID_SUGGESTION");
    expect(() => planNicheExpansion("Shakespeare Translator", related, [], 11)).toThrow();
  });
});
