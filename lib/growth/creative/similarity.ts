import { GrowthCreativeSimilarityClassification } from "@prisma/client";

import { CREATIVE_SIMILARITY_VERSION, MAX_CREATIVE_COMPARISONS } from "@/lib/growth/creative/constants";

export interface SimilarityCandidate {
  id: string;
  title: string;
  contentHash: string;
  destinationPath: string;
  accountId: string | null;
  archetype: string;
  templateId: string;
}

function tokens(value: string) {
  return new Set(value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean));
}

export function titleSimilarity(left: string, right: string) {
  const a = tokens(left);
  const b = tokens(right);
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  return intersection / new Set([...a, ...b]).size;
}

export function classifyCreativeSimilarity(input: Omit<SimilarityCandidate, "id">, history: SimilarityCandidate[]) {
  const bounded = history.slice(0, MAX_CREATIVE_COMPARISONS);
  const exact = bounded.find((item) => item.contentHash === input.contentHash);
  if (exact) {
    return {
      modelVersion: CREATIVE_SIMILARITY_VERSION,
      classification: GrowthCreativeSimilarityClassification.EXACT_DUPLICATE,
      matchedCandidateId: exact.id,
      flags: { crossAccount: Boolean(input.accountId && exact.accountId && input.accountId !== exact.accountId), titleSimilarity: 1 },
    };
  }
  let closest: SimilarityCandidate | null = null;
  let closestScore = 0;
  for (const item of bounded) {
    const score = titleSimilarity(input.title, item.title);
    if (score > closestScore) { closest = item; closestScore = score; }
  }
  if (closest && closestScore >= 0.8) {
    return {
      modelVersion: CREATIVE_SIMILARITY_VERSION,
      classification: GrowthCreativeSimilarityClassification.NEAR_DUPLICATE,
      matchedCandidateId: closest.id,
      flags: { crossAccount: Boolean(input.accountId && closest.accountId && input.accountId !== closest.accountId), titleSimilarity: Number(closestScore.toFixed(4)) },
    };
  }
  const related = bounded.find((item) => item.destinationPath === input.destinationPath);
  return {
    modelVersion: CREATIVE_SIMILARITY_VERSION,
    classification: related ? GrowthCreativeSimilarityClassification.RELATED_DISTINCT : GrowthCreativeSimilarityClassification.DISTINCT,
    matchedCandidateId: related?.id || null,
    flags: { crossAccount: Boolean(related && input.accountId && related.accountId && input.accountId !== related.accountId), titleSimilarity: Number(closestScore.toFixed(4)) },
  };
}

