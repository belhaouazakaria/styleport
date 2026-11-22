import { z } from "zod";

/**
 * Structured, per-translator page content. It travels inside the published
 * editorial payload (no database migration) and drives a page layout that
 * differs by archetype, with page-specific headings and blocks.
 */
export const PAGE_ARCHETYPES = [
  "persona", // character, voice or attitude rewrites (jester, mom, sarcastic)
  "historical", // era English (Victorian, 1800s, medieval, Shakespearean)
  "professional", // workplace and formal writing (LinkedIn, boardroom, polite)
  "language", // real languages and dialects
  "code", // code, hacker and technical transformations
  "emoji", // emoji, symbols and visual text
  "emotion", // mood and feeling rewrites (depressed, desperate, shy)
  "wordplay", // gimmick text effects (muffled, drunk, long words, tongue twisters)
  "fandom", // fictional characters, games, shows
  "comprehension", // decoders from slang or noise into plain English
] as const;
export type PageArchetype = (typeof PAGE_ARCHETYPES)[number];

const short = (max: number, min = 2) => z.string().trim().min(min).max(max);

export const translatorPageSchema = z.object({
  archetype: z.enum(PAGE_ARCHETYPES),
  kicker: short(60).optional(),
  seo: z.object({ title: short(62, 10), description: short(165, 60) }).optional(),
  headings: z.object({
    whatItDoes: short(80, 4),
    examples: short(80, 4),
    about: short(80, 4),
    bestUses: short(80, 4),
    howToUse: short(80, 4),
    tips: short(80, 4),
    difference: short(80, 4),
    faq: short(80, 4),
  }),
  quickFacts: z.array(z.object({ label: short(28), value: short(110) })).min(3).max(5),
  glossary: z.array(z.object({ from: short(70), to: short(110), note: short(160).optional() })).min(4).max(14).optional(),
  situations: z
    .array(z.object({ title: short(70), input: short(320, 4), output: short(600, 4), note: short(220).optional() }))
    .min(3)
    .max(4)
    .optional(),
  ladder: z
    .object({
      input: short(320, 4),
      steps: z.array(z.object({ label: short(40), output: short(600, 2) })).min(2).max(4),
    })
    .optional(),
  fitCheck: z
    .object({ goodFor: z.array(short(180)).min(2).max(5), avoidFor: z.array(short(180)).min(2).max(5) })
    .optional(),
  script: z
    .object({
      name: short(60),
      notes: z.array(short(260)).min(2).max(5),
      phrases: z
        .array(z.object({ english: short(120), target: short(160), romanized: short(160).optional() }))
        .min(5)
        .max(12),
    })
    .optional(),
  origin: short(700, 40).optional(),
});
export type TranslatorPage = z.infer<typeof translatorPageSchema>;

/** Blocks an archetype must provide to be considered complete. */
const REQUIRED_BLOCKS: Record<PageArchetype, Array<keyof TranslatorPage>> = {
  persona: ["situations", "ladder", "fitCheck"],
  historical: ["glossary", "origin", "fitCheck"],
  professional: ["situations", "fitCheck"],
  language: ["script", "situations", "fitCheck"],
  code: ["glossary", "fitCheck"],
  emoji: ["glossary", "ladder"],
  emotion: ["ladder", "situations", "fitCheck"],
  wordplay: ["ladder", "fitCheck"],
  fandom: ["glossary", "situations", "origin"],
  comprehension: ["glossary", "situations", "fitCheck"],
};

export function missingRequiredBlocks(page: TranslatorPage, options: { modeCount?: number } = {}): string[] {
  return REQUIRED_BLOCKS[page.archetype].filter((key) => {
    // A mode ladder needs at least two modes to compare.
    if (key === "ladder" && (options.modeCount ?? 2) < 2) return false;
    const value = page[key];
    return value === undefined || (Array.isArray(value) && value.length === 0);
  });
}

export function parseTranslatorPage(value: unknown): TranslatorPage | null {
  if (!value) return null;
  const parsed = translatorPageSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function flattenPageText(page: TranslatorPage | undefined | null): string[] {
  if (!page) return [];
  return [
    page.kicker || "",
    page.seo?.title || "",
    page.seo?.description || "",
    ...Object.values(page.headings),
    ...page.quickFacts.flatMap((fact) => [fact.label, fact.value]),
    ...(page.glossary || []).flatMap((row) => [row.from, row.to, row.note || ""]),
    ...(page.situations || []).flatMap((row) => [row.title, row.input, row.output, row.note || ""]),
    ...(page.ladder ? [page.ladder.input, ...page.ladder.steps.flatMap((step) => [step.label, step.output])] : []),
    ...(page.fitCheck ? [...page.fitCheck.goodFor, ...page.fitCheck.avoidFor] : []),
    ...(page.script ? [page.script.name, ...page.script.notes, ...page.script.phrases.flatMap((p) => [p.english, p.target, p.romanized || ""])] : []),
    page.origin || "",
  ].filter(Boolean);
}
