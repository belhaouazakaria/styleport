// @vitest-environment node
import { describe, expect, it } from "vitest";
import { nativeThemeAdjustment } from "@/lib/growth/viral/theme-learning";
import { compareNativeCampaign } from "@/lib/growth/viral/native-learning";
import { buildCreativeImagePrompt } from "@/lib/growth/creative/ai-image-provider";
describe("Source-to-native learning", () => {
  it("never treats missing dates or low samples as a performance signal", () => {
    expect(
      compareNativeCampaign({
        sourceImpressions: 5000,
        sourceClicks: 200,
        nativeImpressions: 5000,
        nativeClicks: 500,
        complete: false,
      }).status,
    ).toBe("INSUFFICIENT_EVIDENCE");
    expect(
      compareNativeCampaign({
        sourceImpressions: 50,
        sourceClicks: 2,
        nativeImpressions: 50,
        nativeClicks: 5,
        complete: true,
      }).status,
    ).toBe("INSUFFICIENT_EVIDENCE");
  });
  it("separates qualified rate differences from overlapping uncertainty", () => {
    expect(
      compareNativeCampaign({
        sourceImpressions: 5000,
        sourceClicks: 50,
        nativeImpressions: 5000,
        nativeClicks: 400,
        complete: true,
      }).status,
    ).toBe("NATIVE_OUTPERFORMS");
    expect(
      compareNativeCampaign({
        sourceImpressions: 5000,
        sourceClicks: 100,
        nativeImpressions: 5000,
        nativeClicks: 101,
        complete: true,
      }).status,
    ).toBe("NO_CONFIDENT_DIFFERENCE");
  });
});
describe("Account-specific paid creative direction", () => {
  const input = {
    topic: "Warm wording",
    direction: "EDITORIAL_SPLIT" as const,
    brandName: "SayTwist",
    headline: "Make it warmer",
    beforeLabel: "BEFORE",
    beforeText: "Please send that today.",
    afterLabel: "AFTER",
    afterText: "Could you send that over today?",
    cta: "Try it",
    domain: "saytwist.com",
  };
  it("gives each account a distinct audience brief while preserving exact copy", () => {
    const utility = buildCreativeImagePrompt({
      ...input,
      publicationRole: "SAYTWIST",
    });
    const inspiration = buildCreativeImagePrompt({
      ...input,
      publicationRole: "SAYTWIST_IDEAS",
    });
    const playground = buildCreativeImagePrompt({
      ...input,
      publicationRole: "SAYTWIST_PLAYGROUND",
    });
    expect(utility).toContain("Utility and tool discovery");
    expect(inspiration).toContain("Inspiration and saving");
    expect(playground).toContain("Entertainment and curiosity");
    for (const p of [utility, inspiration, playground])
      expect(p).toContain(JSON.stringify(input.afterText));
  });
});

describe("Bounded native-theme recalibration", () => {
  it("counts independent concepts once and requires mature cohort evidence", () => {
    const winner = {
      conceptId: "one",
      title: "Royal writing Translator",
      outcome: "NATIVE_OUTPERFORMS" as const,
    };
    expect(
      nativeThemeAdjustment("Royal English Translator", [
        winner,
        winner,
        winner,
      ]).adjustment,
    ).toBe(0);
    expect(
      nativeThemeAdjustment("Royal English Translator", [
        winner,
        { ...winner, conceptId: "two" },
        { ...winner, conceptId: "three" },
      ]).adjustment,
    ).toBe(5);
    expect(
      nativeThemeAdjustment("Pirate English Translator", [
        winner,
        { ...winner, conceptId: "two" },
        { ...winner, conceptId: "three" },
      ]).adjustment,
    ).toBe(0);
  });
});
