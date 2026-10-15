import {
  GrowthCreativeArchetype,
  GrowthCreativeDestinationKind,
} from "@prisma/client";
import { z } from "zod";

import { LEARNING_MODEL_VERSION } from "@/lib/growth/learning/constants";

export const learningJobPayloadSchema = z
  .object({
    analysisDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    learningModelVersion: z.literal(LEARNING_MODEL_VERSION),
  })
  .strict();

export const prepareEvergreenRecommendationSchema = z
  .object({
    recommendationId: z.string().trim().min(1).max(191),
    confirmation: z.literal(true),
    paidAiConfirmation: z.literal("QUEUE PAID AI CREATIVE").optional(),
  })
  .strict();

export const evergreenPreparationJobPayloadSchema = z
  .object({ recommendationId: z.string().trim().min(1).max(191) })
  .strict();

export const learningExperimentActionSchema = z
  .object({
    experimentId: z.string().trim().min(1).max(191),
    action: z.enum([
      "START",
      "PAUSE",
      "RESUME",
      "REQUEST_ANALYSIS",
      "FINALIZE",
    ]),
    confirmation: z.literal(true),
  })
  .strict();

export type EvergreenTargetEvidence = {
  destinationKind: GrowthCreativeDestinationKind;
  targetId: string;
  destinationPath: string;
  activeAndPublic: boolean;
  contentUpdatedAt: Date;
  observedMetricDays: number;
  impressions: number;
  outboundClicks: number;
  saves: number;
  qualifiedConversions: number | null;
  attributionAvailable: boolean;
  lastPublishedAt: Date | null;
  publicationCount: number;
  activeEquivalentCount: number;
  activeCandidateCount: number;
  strongFatigue: boolean;
  analyticsFresh: boolean;
  unresolvedAccountIssue: boolean;
  meaningfulAngleAvailable: boolean;
  evidenceComplete: boolean;
  previousArchetypes: GrowthCreativeArchetype[];
};
