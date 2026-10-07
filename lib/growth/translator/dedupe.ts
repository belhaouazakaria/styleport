import { slugify } from "@/lib/slugify";

const GENERIC = new Set([
  "a", "ai", "and", "converter", "for", "generator", "style", "text",
  "the", "to", "translate", "translation", "translator", "with",
]);

export type DuplicateClassification =
  | "EXACT_DUPLICATE"
  | "NEAR_DUPLICATE"
  | "RELATED_DISTINCT"
  | "DISTINCT"
  | "INSUFFICIENT_DATA";

export interface DedupeCandidate {
  id: string;
  name: string;
  slug: string;
  categorySlugs: string[];
  promptPurpose?: string | null;
  sourceLabel?: string | null;
  targetLabel?: string | null;
  archivedAt?: Date | null;
}

function tokens(...values: Array<string | null | undefined>) {
  return new Set(
    values
      .flatMap((value) => slugify(value || "").split("-"))
      .filter((token) => token.length > 1 && !GENERIC.has(token)),
  );
}

function similarity(left: Set<string>, right: Set<string>) {
  const union = new Set([...left, ...right]);
  if (!union.size) return 0;
  let intersection = 0;
  for (const token of left) if (right.has(token)) intersection += 1;
  return intersection / union.size;
}

export function classifyTranslatorDuplicate(
  proposed: Omit<DedupeCandidate, "id">,
  candidates: DedupeCandidate[],
) {
  const proposedSlug = slugify(proposed.slug);
  const proposedName = slugify(proposed.name);
  const proposedTokens = tokens(
    proposed.name,
    proposed.slug,
    proposed.promptPurpose,
    proposed.sourceLabel,
    proposed.targetLabel,
  );
  if (!proposedTokens.size) {
    return { classification: "INSUFFICIENT_DATA" as const, match: null, score: 0 };
  }

  const ranked = candidates
    .map((candidate) => {
      const exact =
        slugify(candidate.slug) === proposedSlug ||
        slugify(candidate.name) === proposedName;
      const lexical = similarity(
        proposedTokens,
        tokens(
          candidate.name,
          candidate.slug,
          candidate.promptPurpose,
          candidate.sourceLabel,
          candidate.targetLabel,
        ),
      );
      const sharedCategory = candidate.categorySlugs.some((slug) =>
        proposed.categorySlugs.map(slugify).includes(slugify(slug)),
      );
      const score = exact ? 1 : Math.min(1, lexical + (sharedCategory ? 0.1 : 0));
      return { candidate, score, exact };
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.candidate.slug.localeCompare(b.candidate.slug) ||
        a.candidate.id.localeCompare(b.candidate.id),
    );

  const best = ranked[0];
  if (!best || best.score < 0.3) {
    return { classification: "DISTINCT" as const, match: null, score: best?.score || 0 };
  }
  const classification: DuplicateClassification = best.exact
    ? "EXACT_DUPLICATE"
    : best.score >= 0.65
      ? "NEAR_DUPLICATE"
      : "RELATED_DISTINCT";
  return { classification, match: best.candidate, score: best.score };
}

