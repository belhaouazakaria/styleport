import type { TranslatorEditorialDraft } from "@/lib/types";

/**
 * Phrases that appear across a large share of the existing translator pages.
 * A page that leans on them reads as a template, so new or regenerated
 * content must not use them. Matching is case-insensitive and treats curly and
 * straight apostrophes the same.
 */
export const TEMPLATE_PHRASES: readonly string[] = [
  "ai text converter",
  "perfect for",
  "unlike standard",
  "unlike typical",
  "unlike generic",
  "unlike traditional",
  "unlike regular",
  "unlike basic",
  "doesn't just",
  "does not just",
  "more than just",
  "whether you're",
  "whether you are",
  "absolutely!",
  "seamless",
  "effortless",
  "vibrant",
  "authentic",
  "rich and",
  "bridging",
  "unique blend",
  "elevate",
  "delve",
  "game-changer",
  "game changer",
  "in today's",
  "it ensures",
  "this translator is designed",
];

function flatten(draft: TranslatorEditorialDraft) {
  return [
    draft.about,
    draft.whatItDoes,
    draft.differenceDescription,
    ...draft.bestUses,
    ...draft.howToUse,
    ...draft.tips,
    ...draft.examples.flatMap((item) => [item.contextTitle || "", item.originalText, item.transformedText]),
    ...draft.faq.flatMap((item) => [item.question, item.answer]),
  ]
    .filter(Boolean)
    .join("\n");
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/[‘’]/g, "'");
}

export function findTemplatePhrases(draft: TranslatorEditorialDraft) {
  const text = normalizeText(flatten(draft));
  return TEMPLATE_PHRASES.filter((phrase) => text.includes(phrase));
}

function tokens(text: string) {
  return normalizeText(text).match(/[a-z0-9À-￿]+/g) || [];
}

function shingles(words: string[], size: number) {
  const set = new Set<string>();
  for (let i = 0; i + size <= words.length; i += 1) set.add(words.slice(i, i + size).join(" "));
  return set;
}

/** Share of the draft's 4-word phrases that also occur in `other` (0 to 1). */
export function sharedPhraseRatio(draftText: string, other: string) {
  const draftShingles = shingles(tokens(draftText), 4);
  if (!draftShingles.size) return 0;
  const otherShingles = shingles(tokens(other), 4);
  let shared = 0;
  for (const item of draftShingles) if (otherShingles.has(item)) shared += 1;
  return shared / draftShingles.size;
}

export interface DistinctnessResult {
  passes: boolean;
  templatePhrases: string[];
  closestSlug: string | null;
  closestSharedRatio: number;
  issues: string[];
}

/**
 * Checks a draft against the existing corpus. Fails when it leans on template
 * phrases or when more than `maxSharedRatio` of its 4-word phrases are copied
 * from a single other page.
 */
export function assessDistinctness(
  draft: TranslatorEditorialDraft,
  corpus: Array<{ slug: string; text: string }>,
  options: { maxTemplatePhrases?: number; maxSharedRatio?: number } = {},
): DistinctnessResult {
  const maxTemplatePhrases = options.maxTemplatePhrases ?? 0;
  const maxSharedRatio = options.maxSharedRatio ?? 0.08;
  const text = flatten(draft);
  const templatePhrases = findTemplatePhrases(draft);
  let closestSlug: string | null = null;
  let closestSharedRatio = 0;
  for (const other of corpus) {
    const ratio = sharedPhraseRatio(text, other.text);
    if (ratio > closestSharedRatio) {
      closestSharedRatio = ratio;
      closestSlug = other.slug;
    }
  }
  const issues: string[] = [];
  if (templatePhrases.length > maxTemplatePhrases) {
    issues.push(`Uses template phrases: ${templatePhrases.join(", ")}`);
  }
  if (closestSharedRatio > maxSharedRatio) {
    issues.push(`Shares ${(closestSharedRatio * 100).toFixed(0)}% of its phrasing with ${closestSlug}`);
  }
  return { passes: issues.length === 0, templatePhrases, closestSlug, closestSharedRatio, issues };
}
