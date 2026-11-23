import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: Array<{ system: string; user: string }> = [];
let designOverride: ((n: number) => unknown) | null = null;
let designCalls = 0;

const baseDesign = (archetype: string, extra: Record<string, unknown> = {}) => ({
  about: "A".repeat(60), whatItDoes: "W".repeat(60), differenceDescription: "D".repeat(60),
  bestUses: ["Use number one here", "Use number two here", "Use number three here"],
  howToUse: ["Step number one here", "Step number two here", "Step number three here"],
  tips: ["Tip number one here", "Tip number two here", "Tip number three here"],
  faq: [1, 2, 3].map((n) => ({ question: `Question number ${n}?`, answer: `Answer number ${n} with enough length.` })),
  exampleInputs: [1, 2, 3, 4].map((n) => ({ contextTitle: `Context ${n}`, originalText: `Source sentence ${n} here` })),
  page: {
    archetype, kicker: "A kicker",
    seo: { title: "Pirate Translator: Talk Like a Sea Dog", description: "Rewrite any message in pirate speech with sea slang and mock-grand flourishes, plus honest notes on when plain text works better." },
    headings: { whatItDoes: "Heading one text", examples: "Heading two text", about: "Heading three text", bestUses: "Heading four text", howToUse: "Heading five text", tips: "Heading six text", difference: "Heading seven text", faq: "Heading eight text" },
    quickFacts: [{ label: "Voice", value: "Pirate" }, { label: "Length", value: "Longer" }, { label: "Not for", value: "Safety text" }],
    ...extra,
  },
});

vi.mock("@/lib/openai", () => ({
  generateOpenAIText: vi.fn(async ({ systemPrompt, userPrompt }: { systemPrompt: string; userPrompt: string }) => {
    calls.push({ system: systemPrompt, user: userPrompt });
    if (systemPrompt.includes("You design a distinctive")) {
      designCalls += 1;
      return { text: JSON.stringify(designOverride ? designOverride(designCalls) : baseDesign("historical", { glossary: [1, 2, 3, 4, 5].map((n) => ({ from: `old ${n}`, to: `new ${n}` })), origin: "O".repeat(60), fitCheck: { goodFor: ["one thing", "two things"], avoidFor: ["three things", "four things"] } })) };
    }
    if (systemPrompt.includes("romanization")) return { text: JSON.stringify(["r1", "r2", "r3", "r4", "r5"]) };
    if (systemPrompt.includes("plain English")) return { text: userPrompt.replace("OUT:", "").replace("tgt-", "phrase ") };
    return { text: `OUT:${userPrompt.split("Input text:\n\n").pop()}` };
  }),
}));

import { generateTranslatorPage, wordOverlap } from "@/lib/translator-page-generation";

const runtime = {
  id: "t1", slug: "pirate-translator", promptSystem: "Talk like a pirate.", promptInstructions: "Rewrite in pirate speech and keep meaning.",
  modelOverride: null, showModeSelector: true,
  modes: [{ key: "classic", label: "Classic", instruction: "Classic pirate" }, { key: "wild", label: "Wild", instruction: "Wild pirate" }],
};
const context = { name: "Pirate Translator", slug: "pirate-translator", description: "Pirate voice", category: "Funny", runtime };

beforeEach(() => { calls.length = 0; designOverride = null; designCalls = 0; });

describe("generateTranslatorPage", () => {
  it("builds examples from real translator runs, not model-written outputs", async () => {
    const result = await generateTranslatorPage({ context });
    expect(result.editorial.examples).toHaveLength(4);
    for (const example of result.editorial.examples) expect(example.transformedText).toBe(`OUT:${example.originalText}`);
    expect(result.editorial.page?.archetype).toBe("historical");
    expect(result.editorial.page?.glossary?.length).toBe(5);
  });

  it("retries once when the archetype misses required blocks, then fails clearly", async () => {
    designOverride = () => baseDesign("historical");
    await expect(generateTranslatorPage({ context })).rejects.toThrow(/missing required blocks/);
    expect(designCalls).toBe(2);
  });

  it("recovers on the second attempt", async () => {
    designOverride = (n) => (n === 1 ? baseDesign("historical") : baseDesign("historical", { glossary: [1, 2, 3, 4, 5].map((i) => ({ from: `a${i}`, to: `b${i}` })), origin: "O".repeat(60), fitCheck: { goodFor: ["x one", "x two"], avoidFor: ["y one", "y two"] } }));
    const result = await generateTranslatorPage({ context });
    expect(result.editorial.page?.origin).toBeTruthy();
    expect(designCalls).toBe(2);
  });

  it("runs the ladder through every mode of the translator", async () => {
    designOverride = () => baseDesign("wordplay", { ladderInput: "Please send the report today", fitCheck: { goodFor: ["x one", "x two"], avoidFor: ["y one", "y two"] } });
    const result = await generateTranslatorPage({ context });
    expect(result.editorial.page?.ladder?.steps.map((s) => s.label)).toEqual(["Classic", "Wild"]);
    expect(calls.some((c) => c.user.includes("Wild pirate"))).toBe(true);
  });

  it("builds a language script panel with phrases run through the translator and a back-translation check", async () => {
    designOverride = () => baseDesign("language", {
      situationInputs: [1, 2, 3].map((n) => ({ title: `Scene ${n}`, input: `Say thing ${n} please` })),
      script: { name: "Gurmukhi", notes: ["Reads left to right.", "Vowel signs wrap letters."], englishPhrases: ["phrase 1", "phrase 2", "phrase 3", "phrase 4", "phrase 5"] },
      fitCheck: { goodFor: ["x one", "x two"], avoidFor: ["y one", "y two"] },
    });
    const result = await generateTranslatorPage({ context });
    expect(result.editorial.page?.script?.phrases).toHaveLength(5);
    expect(result.editorial.page?.script?.phrases[0].romanized).toBe("r1");
    expect(result.checks.backTranslation).toHaveLength(5);
  });
});

describe("wordOverlap", () => {
  it("measures shared meaningful words", () => {
    expect(wordOverlap("please send the report", "send the report please")).toBe(1);
    expect(wordOverlap("please send the report", "completely different words here")).toBe(0);
  });
});

import { GLOSSARY_ARCHETYPES, cleanDesign } from "@/lib/translator-page-generation";

describe("design cleanup and glossary policy", () => {
  it("drops empty template rows and under-filled optional blocks", () => {
    const cleaned = cleanDesign({ page: { glossary: [{ from: "", to: "", note: "" }], situationInputs: [{ title: "", input: "" }], ladderInput: "", origin: " ", fitCheck: { goodFor: ["", ""], avoidFor: ["a thing", "b thing"] }, script: { englishPhrases: ["", "", "", "", ""], notes: ["", ""] } } }) as { page: Record<string, unknown> };
    for (const key of ["glossary", "situationInputs", "ladderInput", "origin", "fitCheck", "script"]) expect(cleaned.page[key]).toBeUndefined();
  });
  it("keeps filled rows", () => {
    const rows = [1, 2, 3, 4].map((n) => ({ from: `a${n}`, to: `b${n}`, note: "" }));
    const cleaned = cleanDesign({ page: { glossary: [...rows, { from: "", to: "" }] } }) as { page: { glossary: unknown[] } };
    expect(cleaned.page.glossary).toHaveLength(4);
  });
  it("only historical, code, emoji, fandom and comprehension carry a word map", () => {
    expect([...GLOSSARY_ARCHETYPES].sort()).toEqual(["code", "comprehension", "emoji", "fandom", "historical"]);
  });
  it("strips a filler glossary from a persona page", async () => {
    designOverride = () => baseDesign("persona", { glossary: [1, 2, 3, 4].map((n) => ({ from: `Classic ${n}`, to: `Steady ${n}` })), situationInputs: [1, 2, 3].map((n) => ({ title: `Scene ${n}`, input: `Say thing ${n} please` })), ladderInput: "Please send the report today", fitCheck: { goodFor: ["x one", "x two"], avoidFor: ["y one", "y two"] } });
    const result = await generateTranslatorPage({ context });
    expect(result.editorial.page?.glossary).toBeUndefined();
  });
});
