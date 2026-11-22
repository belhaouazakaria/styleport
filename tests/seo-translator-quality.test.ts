import { describe, expect, it } from "vitest";

import { assessEditorialQuality } from "@/lib/editorial-quality";
import { pickRingNeighbourIds } from "@/lib/data/translators";
import { assessTranslatorIndexingEligibility } from "@/lib/indexing-eligibility";
import { isPolicyNoindex, needsLanguageAccuracyNotice } from "@/lib/seo/index-policy";
import { serializeJsonLd, buildTranslatorJsonLd } from "@/lib/seo/structured-data";
import { buildTranslatorDescription, buildTranslatorTitle, truncateAtWord } from "@/lib/seo/translator-metadata";

describe("translator titles and descriptions", () => {
  it("keeps short seoTitles and appends the brand when it fits", () => {
    expect(buildTranslatorTitle({ seoTitle: "Pirate Translator", name: "Pirate", brand: "SayTwist" })).toBe(
      "Pirate Translator | SayTwist",
    );
  });

  it("trims long seoTitles at a word boundary without exceeding 60 characters", () => {
    const title = buildTranslatorTitle({
      seoTitle: "Freaky Translator - Convert Text into Quirky and Eccentric Style",
      name: "Freaky Translator",
      brand: "SayTwist",
    });
    expect(title.length).toBeLessThanOrEqual(60);
    expect(title.startsWith("Freaky Translator")).toBe(true);
    expect(title.endsWith("-")).toBe(false);
  });

  it("gives duplicate-named translators distinct titles from their distinct seoTitles", () => {
    const a = buildTranslatorTitle({ seoTitle: "Error Message Translator - Clear & Friendly AI Text Converter", name: "Error Message Translator", brand: "SayTwist" });
    const b = buildTranslatorTitle({ seoTitle: "Error Message Translator - Witty AI Text Converter for Snarky Alerts", name: "Error Message Translator", brand: "SayTwist" });
    expect(a).not.toBe(b);
  });

  it("falls back to the name when seoTitle is empty", () => {
    expect(buildTranslatorTitle({ seoTitle: "  ", name: "Pirate Translator", brand: "SayTwist" })).toBe("Pirate Translator | SayTwist");
  });

  it("trims descriptions at a word boundary with no ellipsis", () => {
    const long = "Use the Error Message Translator to convert complex technical error messages into simple, user-friendly text. Improve communication and user experience with this AI translator for error messages and alerts.";
    const out = buildTranslatorDescription({ seoDescription: long, fallback: "x" });
    expect(out.length).toBeLessThanOrEqual(158);
    expect(out).not.toContain("…");
    expect(long.startsWith(out)).toBe(true);
  });

  it("truncateAtWord leaves short text alone", () => {
    expect(truncateAtWord("short text", 60)).toBe("short text");
  });
});

describe("internal link ring", () => {
  const ids = ["a", "b", "c", "d", "e", "f"];
  it("links to the next neighbours and wraps around", () => {
    expect(pickRingNeighbourIds(ids, "e", 3)).toEqual(["f", "a", "b"]);
  });
  it("gives every page the same number of inbound links", () => {
    const inbound = new Map<string, number>();
    for (const id of ids) for (const n of pickRingNeighbourIds(ids, id, 3)) inbound.set(n, (inbound.get(n) || 0) + 1);
    expect(new Set(inbound.values())).toEqual(new Set([3]));
    expect(inbound.size).toBe(ids.length);
  });
  it("never links a page to itself and caps at the ring size", () => {
    expect(pickRingNeighbourIds(["a", "b"], "a", 5)).toEqual(["b"]);
    expect(pickRingNeighbourIds(["a"], "a", 5)).toEqual([]);
  });
});

describe("index policy", () => {
  it("flags real-person, stereotype and placeholder pages", () => {
    expect(isPolicyNoindex("meri-brown-translator")).toBe(true);
    expect(isPolicyNoindex("qwertyuiopasdfghjklzxcvbnm-translator")).toBe(true);
    expect(isPolicyNoindex("punjabi-translator")).toBe(false);
  });
  it("shows the accuracy notice for real-language pages", () => {
    expect(needsLanguageAccuracyNotice("punjabi-translator")).toBe(true);
    expect(needsLanguageAccuracyNotice("pirate-translator")).toBe(false);
  });
  it("removes policy-noindex translators from sitemap eligibility without affecting others", () => {
    const editorial = {
      about: "x".repeat(60), whatItDoes: "y".repeat(60), differenceDescription: "z".repeat(60),
      bestUses: ["Best use number one here", "Best use number two here"],
      howToUse: ["How to step number one", "How to step number two"],
      tips: ["A helpful tip number one", "A helpful tip number two"],
      examples: [1, 2, 3].map((n) => ({ contextTitle: `Ctx ${n}`, originalText: `original text ${n}`, transformedText: `changed output ${n}!` })),
      faq: [1, 2, 3].map((n) => ({ question: `Question number ${n} here?`, answer: `A reasonably long answer number ${n}.` })),
    };
    const base = { isActive: true, archivedAt: null, currentEditorial: editorial, latestReviewedPublishedDraft: null };
    expect(assessTranslatorIndexingEligibility({ ...base, slug: "ok-translator" }).newVersionIndexable).toBe(true);
    const blocked = assessTranslatorIndexingEligibility({ ...base, slug: "cupcakke-translator" });
    expect(blocked.newVersionIndexable).toBe(false);
    expect(blocked.newVersionExclusionReasonCodes).toContain("POLICY_NOINDEX");
    expect(blocked.deployedBaselineIndexable).toBe(true);
  });
});

describe("editorial filler detection", () => {
  it("catches curly-apostrophe filler phrases", () => {
    const draft = {
      about: "Whether you’re writing a letter or a poem, this helps. ".repeat(3),
      whatItDoes: "w".repeat(80), differenceDescription: "d".repeat(100),
      bestUses: ["one one one one one", "two two two two two", "three three three three"],
      howToUse: ["one one one one one", "two two two two two", "three three three three"],
      tips: ["tip one one one one one", "tip two two two two", "tip three three three three"],
      examples: [1, 2, 3].map((n) => ({ contextTitle: `Ctx ${n}`, originalText: `original ${n} text`, transformedText: `different ${n} output` })),
      faq: [1, 2, 3].map((n) => ({ question: `Question number ${n} here?`, answer: `Answer number ${n} that is long enough.` })),
    };
    expect(assessEditorialQuality(draft, { humanReviewed: true }).issues).toContain("Generic AI-style filler requires rewriting");
  });
});

describe("structured data", () => {
  it("escapes script-breaking characters", () => {
    expect(serializeJsonLd({ a: "</script><b>&" })).not.toMatch(/<\/script>|<b>/);
  });
  it("uses the canonical base for every URL", () => {
    const [app, crumbs] = buildTranslatorJsonLd({ baseUrl: "https://saytwist.com/", platformName: "SayTwist", name: "Pirate", slug: "pirate-translator", description: "d" });
    expect(app.url).toBe("https://saytwist.com/translators/pirate-translator");
    expect(JSON.stringify(crumbs)).not.toContain("whattypeof");
  });
});

describe("title trimming", () => {
  it("does not end on a dangling connector word", () => {
    const title = buildTranslatorTitle({ seoTitle: "Error Message Translator - Witty AI Text Converter for Snarky Computer Alerts", name: "x", brand: "SayTwist" });
    expect(title).not.toMatch(/\b(for|and|to|of|with|in|a|an|the)$/i);
    expect(title.length).toBeLessThanOrEqual(60);
  });
});
