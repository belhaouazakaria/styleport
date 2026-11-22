import type { PageArchetype, TranslatorPage } from "@/lib/translator-page";

export type SectionKey =
  | "facts" | "whatItDoes" | "examples" | "situations" | "ladder" | "glossary" | "script" | "origin"
  | "about" | "uses" | "steps" | "tips" | "fitCheck" | "difference" | "faq";

export type ExamplesStyle = "cards" | "chat" | "table" | "quotes";
export type UsesStyle = "grid" | "checklist" | "notes";
export type FactsStyle = "strip" | "grid";
export type AccentKey = "teal" | "coral" | "violet" | "amber" | "sky" | "rose";

const BASE_ORDER: Record<PageArchetype, SectionKey[]> = {
  persona: ["facts", "whatItDoes", "situations", "ladder", "glossary", "about", "examples", "uses", "fitCheck", "steps", "tips", "difference", "faq"],
  historical: ["facts", "whatItDoes", "glossary", "examples", "origin", "about", "steps", "uses", "difference", "tips", "fitCheck", "faq"],
  professional: ["facts", "whatItDoes", "situations", "fitCheck", "about", "steps", "tips", "uses", "examples", "difference", "faq"],
  language: ["facts", "whatItDoes", "script", "situations", "about", "uses", "examples", "steps", "tips", "fitCheck", "difference", "faq"],
  code: ["facts", "whatItDoes", "examples", "steps", "glossary", "about", "uses", "tips", "difference", "faq"],
  emoji: ["facts", "whatItDoes", "examples", "glossary", "ladder", "about", "uses", "tips", "faq"],
  emotion: ["facts", "whatItDoes", "ladder", "situations", "about", "fitCheck", "uses", "examples", "tips", "steps", "difference", "faq"],
  wordplay: ["facts", "ladder", "examples", "whatItDoes", "about", "uses", "steps", "tips", "difference", "faq"],
  fandom: ["facts", "whatItDoes", "glossary", "situations", "origin", "about", "examples", "uses", "fitCheck", "tips", "difference", "faq"],
  comprehension: ["facts", "whatItDoes", "glossary", "situations", "about", "examples", "steps", "uses", "tips", "fitCheck", "difference", "faq"],
};

export function hashSlug(slug: string) {
  let hash = 2166136261;
  for (let i = 0; i < slug.length; i += 1) {
    hash ^= slug.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

const ACCENTS: AccentKey[] = ["teal", "coral", "violet", "amber", "sky", "rose"];
const EXAMPLE_STYLES: ExamplesStyle[] = ["cards", "chat", "table", "quotes"];
const USES_STYLES: UsesStyle[] = ["grid", "checklist", "notes"];

export interface PageLayout {
  sections: SectionKey[];
  accent: AccentKey;
  examplesStyle: ExamplesStyle;
  usesStyle: UsesStyle;
  factsStyle: FactsStyle;
}

export interface LayoutInputs {
  hasExamples: boolean;
  hasUses: boolean;
  hasSteps: boolean;
  hasTips: boolean;
  hasAbout: boolean;
  hasDifference: boolean;
  hasFaq: boolean;
}

export function composeLayout(page: TranslatorPage, slug: string, inputs: LayoutInputs): PageLayout {
  const seed = hashSlug(slug);
  const present: Record<SectionKey, boolean> = {
    facts: page.quickFacts.length >= 3,
    whatItDoes: true,
    examples: inputs.hasExamples,
    situations: Boolean(page.situations?.length),
    ladder: Boolean(page.ladder?.steps.length),
    glossary: Boolean(page.glossary?.length),
    script: Boolean(page.script),
    origin: Boolean(page.origin),
    about: inputs.hasAbout,
    uses: inputs.hasUses,
    steps: inputs.hasSteps,
    tips: inputs.hasTips,
    fitCheck: Boolean(page.fitCheck),
    difference: inputs.hasDifference,
    faq: inputs.hasFaq,
  };
  let sections = BASE_ORDER[page.archetype].filter((key) => present[key]);
  // Where both exist, the real-output examples and situations should not sit back to back.
  const exIndex = sections.indexOf("examples");
  const siIndex = sections.indexOf("situations");
  if (exIndex >= 0 && siIndex >= 0 && Math.abs(exIndex - siIndex) === 1) {
    sections = sections.filter((key) => key !== "examples");
    sections.splice(Math.min(sections.length - 1, siIndex + 3), 0, "examples");
  }
  // Seeded swap of two adjacent mid-page sections so same-archetype pages still differ.
  const swappable = sections.map((key, index) => ({ key, index })).filter((item) => ["uses", "steps", "tips", "about"].includes(item.key));
  if (swappable.length >= 2 && seed % 2 === 1) {
    const a = swappable[0].index;
    const b = swappable[1].index;
    [sections[a], sections[b]] = [sections[b], sections[a]];
  }
  return {
    sections,
    accent: ACCENTS[seed % ACCENTS.length],
    examplesStyle: EXAMPLE_STYLES[(seed >>> 3) % EXAMPLE_STYLES.length],
    usesStyle: USES_STYLES[(seed >>> 5) % USES_STYLES.length],
    factsStyle: (seed >>> 7) % 2 === 0 ? "strip" : "grid",
  };
}
