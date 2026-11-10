import { describe, expect, it } from "vitest";
import {
  rateSourceTranslator, rankSourceTranslators,
  SOURCE_PRIORITY_THRESHOLD, SOURCE_DEFER_THRESHOLD,
} from "@/lib/growth/viral/rating";

const source = (slug: string) =>
  "https://anythingtranslate.com/translators/" + slug + "/";

describe("AnythingTranslate source editorial rating v1", () => {
  it("puts understandable, recognizable translator styles in priority", () => {
    const item = rateSourceTranslator(
      "Poetic English Translator", source("poetic-english-translator"));
    expect(item.score).toBeGreaterThanOrEqual(SOURCE_PRIORITY_THRESHOLD);
    expect(item.decision).toBe("PRIORITY");
    expect(item.suggestedDelayDays).toBeNull();
    expect(item.reasons).toContain("RECOGNIZABLE_STYLE");
  });

  it("defers mediocre titles for later, rather than posting immediately", () => {
    const item = rateSourceTranslator(
      "Old West Germanic Translator", source("old-west-germanic-translator"));
    expect(item.score).toBeGreaterThanOrEqual(SOURCE_DEFER_THRESHOLD);
    expect(item.score).toBeLessThan(SOURCE_PRIORITY_THRESHOLD);
    expect(item.decision).toBe("SCHEDULE_LATER");
    expect(item.suggestedDelayDays).toBeGreaterThanOrEqual(2);
  });

  it("withdraws ambiguous, noisy, meaningless or malformed titles", () => {
    const titles = [
      ["Amane Translator", "amane-translator"],
      ["Only In Translator", "only-in-translator"],
      ["Normal-sería-Tímida Translator", "normal-seria-timida-translator"],
    ];
    for (const [title, slug] of titles) {
      expect(rateSourceTranslator(title, source(slug)).decision).toBe("WITHDRAW");
    }
    expect(rateSourceTranslator(
      "Poetic English Translator", "https://evil.test/translators/poetic-english/"))
      .toMatchObject({ score: 0, decision: "WITHDRAW" });
    expect(rateSourceTranslator(
      "<script> Translator", source("script-translator")).decision).toBe("WITHDRAW");
  });

  it("demotes semantically duplicate themes and schedules later ones on successive days", () => {
    const topics = [
      { id: "1", title: "Royal English Translator",
        sourceUrl: source("royal-english-translator") },
      { id: "2", title: "Royal Language Translator",
        sourceUrl: source("royal-language-translator") },
      { id: "3", title: "Old West Germanic Translator",
        sourceUrl: source("old-west-germanic-translator") },
    ];
    const ranked = rankSourceTranslators(topics);
    const royal = ranked.filter(x => x.title.startsWith("Royal"));
    expect(royal.filter(x => x.rating.decision === "PRIORITY")).toHaveLength(1);
    expect(royal.some(x => x.rating.reasons.includes("SIMILAR_TOPIC_ALREADY_RANKED"))).toBe(true);
    const later = ranked.filter(x => x.rating.decision === "SCHEDULE_LATER");
    expect(new Set(later.map(x => x.rating.suggestedDelayDays)).size).toBe(later.length);
    expect(rankSourceTranslators(topics)).toEqual(ranked);
  });

  it("does not confuse heuristic editorial score with provider-backed winner evidence", () => {
    const item = rateSourceTranslator(
      "Romantic English Translator", source("romantic-english-translator"));
    expect(item).not.toHaveProperty("impressions");
    expect(item).not.toHaveProperty("outboundClicks");
    expect(item).not.toHaveProperty("isViral");
  });
});
