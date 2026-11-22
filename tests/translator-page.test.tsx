import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { TranslatorPageSections } from "@/components/public/translator-page-sections";
import { composeLayout, hashSlug } from "@/lib/translator-page-layout";
import { PAGE_ARCHETYPES, flattenPageText, missingRequiredBlocks, parseTranslatorPage, type TranslatorPage } from "@/lib/translator-page";

const headings = {
  whatItDoes: "Why the jester never answers plainly",
  examples: "Court announcements, reworked",
  about: "Behind the bells and motley",
  bestUses: "Where the fool earns his keep",
  howToUse: "Three steps to a proper flourish",
  tips: "Small tricks for sharper puns",
  difference: "Where wit stops and clarity starts",
  faq: "What people ask the fool",
};

function samplePage(archetype: TranslatorPage["archetype"] = "persona"): TranslatorPage {
  return {
    archetype,
    kicker: "Bells, puns and pratfalls",
    seo: { title: "Jester Translator: Rewrite Text Like a Court Fool", description: "Rewrite plain messages in a court jester's voice with puns and mock-solemn flourishes. Free, instant, and honest about when plain text is better." },
    headings,
    quickFacts: [{ label: "Voice", value: "Court fool" }, { label: "Output", value: "Slightly longer" }, { label: "Not for", value: "Legal or safety text" }],
    glossary: [1, 2, 3, 4, 5].map((n) => ({ from: `plain ${n}`, to: `jester ${n}`, note: `note ${n}` })),
    situations: [1, 2, 3].map((n) => ({ title: `Scenario ${n}`, input: `input ${n} text`, output: `output ${n} text` })),
    ladder: { input: "Please send the report.", steps: [{ label: "Classic", output: "A report, good sir!" }, { label: "Wild", output: "Hark, a scroll!" }] },
    fitCheck: { goodFor: ["Event invites", "Captions"], avoidFor: ["Contracts", "Medical notes"] },
    origin: "Court jesters used wordplay and licensed mockery to speak truths kings did not want to hear plainly in public.",
    script: { name: "Gurmukhi", notes: ["Reads left to right.", "Vowel marks sit around the letter."], phrases: [1, 2, 3, 4, 5].map((n) => ({ english: `phrase ${n}`, target: `target ${n}`, romanized: `roman ${n}` })) },
  };
}

const editorial = {
  about: "About text here for the jester.", whatItDoes: "Does a thing in a jester voice.", differenceDescription: "Differs in specific ways.",
  bestUses: [{ content: "Use one", sortOrder: 1 }, { content: "Use two", sortOrder: 2 }, { content: "Use three", sortOrder: 3 }],
  howToUse: [{ content: "Step one", sortOrder: 1 }, { content: "Step two", sortOrder: 2 }, { content: "Step three", sortOrder: 3 }],
  tips: [{ content: "Tip one", sortOrder: 1 }, { content: "Tip two", sortOrder: 2 }, { content: "Tip three", sortOrder: 3 }],
  examples: [1, 2, 3, 4].map((n) => ({ contextTitle: `Context ${n}`, originalText: `orig ${n}`, transformedText: `out ${n}`, sortOrder: n })),
  faq: [1, 2, 3].map((n) => ({ question: `Question ${n}?`, answer: `Answer ${n} long enough`, sortOrder: n })),
};
const inputs = { hasExamples: true, hasUses: true, hasSteps: true, hasTips: true, hasAbout: true, hasDifference: true, hasFaq: true };

describe("page schema", () => {
  it("accepts a complete page and rejects an unknown archetype", () => {
    expect(parseTranslatorPage(samplePage())).not.toBeNull();
    expect(parseTranslatorPage({ ...samplePage(), archetype: "other" })).toBeNull();
    expect(parseTranslatorPage(null)).toBeNull();
  });
  it("reports blocks an archetype still needs", () => {
    const bare = { ...samplePage("historical"), glossary: undefined } as TranslatorPage;
    expect(missingRequiredBlocks(bare)).toContain("glossary");
    expect(missingRequiredBlocks(samplePage("persona"))).toEqual([]);
    expect(missingRequiredBlocks({ ...samplePage("persona"), ladder: undefined }, { modeCount: 1 })).toEqual([]);
  });
  it("flattens every text block for similarity checks", () => {
    const text = flattenPageText(samplePage()).join(" ");
    expect(text).toContain("Why the jester never answers plainly");
    expect(text).toContain("output 2 text");
  });
});

describe("layout composer", () => {
  it("is deterministic per slug", () => {
    expect(composeLayout(samplePage(), "jester-translator", inputs)).toEqual(composeLayout(samplePage(), "jester-translator", inputs));
    expect(hashSlug("a")).not.toBe(hashSlug("b"));
  });
  it("orders sections differently across archetypes", () => {
    const orders = new Set(PAGE_ARCHETYPES.map((a) => composeLayout({ ...samplePage(a) }, "x", inputs).sections.join(",")));
    expect(orders.size).toBeGreaterThanOrEqual(8);
  });
  it("varies visual treatment across slugs and drops sections without data", () => {
    const accents = new Set(Array.from({ length: 24 }, (_, i) => composeLayout(samplePage(), `slug-${i}`, inputs).accent));
    expect(accents.size).toBeGreaterThanOrEqual(4);
    const bare = composeLayout({ ...samplePage(), glossary: undefined, ladder: undefined, situations: undefined, fitCheck: undefined, origin: undefined, script: undefined }, "s", { ...inputs, hasTips: false });
    expect(bare.sections).not.toContain("glossary");
    expect(bare.sections).not.toContain("tips");
  });
  it("never places real-output examples directly beside situations", () => {
    for (const a of PAGE_ARCHETYPES) {
      const sections = composeLayout(samplePage(a), "s", inputs).sections;
      const e = sections.indexOf("examples");
      const s = sections.indexOf("situations");
      if (e >= 0 && s >= 0) expect(Math.abs(e - s)).toBeGreaterThan(1);
    }
  });
});

describe("page renderer", () => {
  it("renders page-specific headings and real outputs for every archetype and style", () => {
    for (const archetype of PAGE_ARCHETYPES) {
      for (const slug of ["a", "bb", "ccc", "dddd", "eeeee", "ffffff"]) {
        const page = samplePage(archetype);
        const layout = composeLayout(page, slug, inputs);
        const html = renderToStaticMarkup(<TranslatorPageSections page={page} layout={layout} editorial={editorial} />);
        expect(html).toContain("Why the jester never answers plainly");
        expect(html).not.toContain("About this translator");
        expect(html).not.toContain("Tips for better results");
        expect(html).toContain("out 1");
      }
    }
  });
  it("renders the script panel with the honesty note", () => {
    const page = samplePage("language");
    const html = renderToStaticMarkup(<TranslatorPageSections page={page} layout={composeLayout(page, "p", inputs)} editorial={editorial} />);
    expect(html).toContain("Gurmukhi");
    expect(html).toContain("not verified by native speakers");
  });
});

vi.mock("@/lib/openai", () => ({
  generateOpenAIText: vi.fn(async ({ userPrompt }: { userPrompt: string }) => ({ text: `REAL(${userPrompt.slice(0, 20)})` })),
}));
