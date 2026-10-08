import { slugify } from "@/lib/slugify";
import { MAX_IDEA_DEDUPE_CANDIDATES } from "@/lib/growth/ideas/constants";

const GENERIC = new Set(["a", "an", "and", "for", "how", "ideas", "of", "say", "the", "to", "ways", "what", "with"]);

export type IdeaDuplicateClassification = "EXACT_DUPLICATE" | "NEAR_DUPLICATE" | "RELATED_DISTINCT" | "DISTINCT" | "INSUFFICIENT_DATA";

export interface IdeaDedupeCandidate {
  id: string;
  title: string;
  slug: string;
  categoryId: string;
  clusterId: string | null;
  itemFingerprints: string[];
  archivedAt?: Date | null;
}

function tokens(...values: string[]) {
  return new Set(values.flatMap((value) => slugify(value).split("-")).filter((item) => item.length > 1 && !GENERIC.has(item)));
}

function jaccard(left: Set<string>, right: Set<string>) {
  const union = new Set([...left, ...right]);
  if (!union.size) return 0;
  let overlap = 0;
  for (const item of left) if (right.has(item)) overlap += 1;
  return overlap / union.size;
}

export function classifyIdeaDuplicate(proposed: Omit<IdeaDedupeCandidate, "id">, candidates: IdeaDedupeCandidate[]) {
  if (candidates.length > MAX_IDEA_DEDUPE_CANDIDATES) {
    return { classification: "INSUFFICIENT_DATA" as const, match: null, score: 0, capExceeded: true };
  }
  const proposedTokens = tokens(proposed.title, proposed.slug);
  if (!proposedTokens.size) return { classification: "INSUFFICIENT_DATA" as const, match: null, score: 0 };
  const proposedItems = new Set(proposed.itemFingerprints.map(slugify).filter(Boolean));
  const ranked = candidates.map((candidate) => {
    const exact = slugify(candidate.slug) === slugify(proposed.slug) || slugify(candidate.title) === slugify(proposed.title);
    const lexical = jaccard(proposedTokens, tokens(candidate.title, candidate.slug));
    const itemOverlap = proposedItems.size ? jaccard(proposedItems, new Set(candidate.itemFingerprints.map(slugify).filter(Boolean))) : 0;
    const sameCategory = candidate.categoryId === proposed.categoryId;
    const sameCluster = Boolean(proposed.clusterId && candidate.clusterId === proposed.clusterId);
    const score = exact ? 1 : Math.min(1, lexical * 0.7 + itemOverlap * 0.2 + (sameCategory ? 0.07 : 0) + (sameCluster ? 0.03 : 0));
    return { candidate, exact, score };
  }).sort((left, right) => right.score - left.score || left.candidate.slug.localeCompare(right.candidate.slug));
  const best = ranked[0];
  if (!best || best.score < 0.15) return { classification: "DISTINCT" as const, match: null, score: best?.score || 0 };
  const classification: IdeaDuplicateClassification = best.exact ? "EXACT_DUPLICATE" : best.score >= 0.66 ? "NEAR_DUPLICATE" : "RELATED_DISTINCT";
  return { classification, match: best.candidate, score: best.score };
}

export function ideaItemFingerprints(blocks: Array<Record<string, unknown>>) {
  return blocks.flatMap((block) => {
    if (!Array.isArray(block.items)) return [];
    return block.items.map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object") {
        const value = item as Record<string, unknown>;
        return String(value.text || value.suggestion || "");
      }
      return "";
    }).filter(Boolean);
  }).slice(0, 120);
}
