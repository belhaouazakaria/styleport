import { GrowthCreativeSimilarityClassification } from "@prisma/client";

import { CREATIVE_SIMILARITY_VERSION, MAX_CREATIVE_COMPARISONS } from "@/lib/growth/creative/constants";

export interface SimilarityCandidate {
  id: string;
  title: string;
  contentHash: string;
  destinationPath: string;
  topic: string;
  accountId: string | null;
  archetype: string;
  templateId: string;
  visualTreatment: string;
}

function tokens(value: string) {
  return new Set(value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean));
}

function tokenSimilarity(left: string, right: string) {
  const a = tokens(left);
  const b = tokens(right);
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  return intersection / new Set([...a, ...b]).size;
}

export function titleSimilarity(left: string, right: string) {
  return tokenSimilarity(left, right);
}

function boundedFlags(input: Omit<SimilarityCandidate, "id">, matched: SimilarityCandidate, titleScore: number, exactContentHash: boolean, exactAssetChecksum: boolean) {
  return {
    matchedCandidateId: matched.id,
    exactContentHash,
    exactAssetChecksum,
    crossAccount: Boolean(input.accountId && matched.accountId && input.accountId !== matched.accountId),
    sameDestination: input.destinationPath === matched.destinationPath,
    sameArchetype: input.archetype === matched.archetype,
    sameTemplate: input.templateId === matched.templateId,
    sameVisualTreatment: input.visualTreatment === matched.visualTreatment,
    titleSimilarity: Number(titleScore.toFixed(4)),
  };
}

export function buildExactCreativeSimilarity(input: Omit<SimilarityCandidate, "id">, matched: SimilarityCandidate, exact: { contentHash: boolean; assetChecksum: boolean }) {
  return {
    modelVersion: CREATIVE_SIMILARITY_VERSION,
    classification: GrowthCreativeSimilarityClassification.EXACT_DUPLICATE,
    matchedCandidateId: matched.id,
    flags: boundedFlags(input, matched, titleSimilarity(input.title, matched.title), exact.contentHash, exact.assetChecksum),
  };
}

export function classifyCreativeSimilarity(input: Omit<SimilarityCandidate, "id">, history: SimilarityCandidate[]) {
  const bounded = history.slice(0, MAX_CREATIVE_COMPARISONS);
  let related: SimilarityCandidate | null = null;
  let relatedTitleScore = 0;
  let visuallyEquivalent: SimilarityCandidate | null = null;
  let visuallyEquivalentTitleScore = 0;
  for (const item of bounded) {
    const titleScore = titleSimilarity(input.title, item.title);
    const sameDestination = input.destinationPath === item.destinationPath;
    const equivalentTopic = tokenSimilarity(input.topic, item.topic) >= 0.8;
    if (!sameDestination && !equivalentTopic) continue;
    if (!related || titleScore > relatedTitleScore) {
      related = item;
      relatedTitleScore = titleScore;
    }
    const sameVisualSemantics = input.archetype === item.archetype
      && input.templateId === item.templateId
      && input.visualTreatment === item.visualTreatment;
    if (sameVisualSemantics && (!visuallyEquivalent || titleScore > visuallyEquivalentTitleScore)) {
      visuallyEquivalent = item;
      visuallyEquivalentTitleScore = titleScore;
    }
  }
  if (visuallyEquivalent && visuallyEquivalentTitleScore >= 0.8) {
    return {
      modelVersion: CREATIVE_SIMILARITY_VERSION,
      classification: GrowthCreativeSimilarityClassification.NEAR_DUPLICATE,
      matchedCandidateId: visuallyEquivalent.id,
      flags: boundedFlags(input, visuallyEquivalent, visuallyEquivalentTitleScore, false, false),
    };
  }
  return {
    modelVersion: CREATIVE_SIMILARITY_VERSION,
    classification: related ? GrowthCreativeSimilarityClassification.RELATED_DISTINCT : GrowthCreativeSimilarityClassification.DISTINCT,
    matchedCandidateId: related?.id || null,
    flags: related ? boundedFlags(input, related, relatedTitleScore, false, false) : {
      matchedCandidateId: null,
      exactContentHash: false,
      exactAssetChecksum: false,
      crossAccount: false,
      sameDestination: false,
      sameArchetype: false,
      sameTemplate: false,
      sameVisualTreatment: false,
      titleSimilarity: 0,
    },
  };
}
