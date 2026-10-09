import { GrowthCreativeSimilarityClassification } from "@prisma/client";
import { z } from "zod";

const flagsSchema = z.object({
  matchedCandidateId: z.string().max(64).nullable().optional(),
  exactContentHash: z.boolean().optional(),
  exactAssetChecksum: z.boolean().optional(),
  sameDestination: z.boolean().optional(),
  sameArchetype: z.boolean().optional(),
  sameTemplate: z.boolean().optional(),
  sameVisualTreatment: z.boolean().optional(),
  titleSimilarity: z.number().min(0).max(1).optional(),
}).passthrough();

export function parseCreativeSimilarityFlags(value: unknown) {
  const parsed = flagsSchema.safeParse(value);
  return parsed.success ? parsed.data : {};
}

export function deferredCandidatePresentation(result: string, rawFlags: unknown) {
  const flags = parseCreativeSimilarityFlags(rawFlags);
  const evidence: string[] = [];
  if (flags.exactContentHash) evidence.push("Same generated content");
  if (flags.exactAssetChecksum) evidence.push("Same image asset");
  if (typeof flags.titleSimilarity === "number" && result === GrowthCreativeSimilarityClassification.NEAR_DUPLICATE) evidence.push(`Title similarity: ${Math.round(flags.titleSimilarity * 100)}%`);
  if (flags.sameDestination) evidence.push("Same destination");
  if (flags.sameTemplate) evidence.push("Same template");
  if (flags.sameVisualTreatment) evidence.push("Same creative direction");
  if (result === GrowthCreativeSimilarityClassification.EXACT_DUPLICATE) {
    return { label: "Deferred · Duplicate", reason: "Effectively identical to an existing candidate.", evidence, matchedCandidateId: flags.matchedCandidateId || null };
  }
  if (result === GrowthCreativeSimilarityClassification.NEAR_DUPLICATE) {
    return { label: "Deferred · Too similar", reason: "Too similar to an existing candidate.", evidence, matchedCandidateId: flags.matchedCandidateId || null };
  }
  return { label: "Deferred", reason: "Held for review by Creative Lab safeguards.", evidence, matchedCandidateId: flags.matchedCandidateId || null };
}
