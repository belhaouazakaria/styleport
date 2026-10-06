import { GrowthOpportunityType } from "@prisma/client";
import { GrowthPinSignalType, GrowthSignalStrength } from "@prisma/client";
import { z } from "zod";
import {
  CONTENT_CLUSTERING_VERSION,
  OPPORTUNITY_INTELLIGENCE_VERSION,
  OPPORTUNITY_SCORING_VERSION,
} from "./constants";
const count = z.string().regex(/^\d+$/).max(40);
export const opportunityJobPayloadSchema = z
  .object({
    analysisDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    modelVersion: z.literal(OPPORTUNITY_INTELLIGENCE_VERSION),
  })
  .strict();
export const opportunityEvidenceSchema = z
  .object({
    intelligenceModelVersion: z.literal(OPPORTUNITY_INTELLIGENCE_VERSION),
    scoringModelVersion: z.literal(OPPORTUNITY_SCORING_VERSION),
    clusteringModelVersion: z.literal(CONTENT_CLUSTERING_VERSION),
    type: z.nativeEnum(GrowthOpportunityType),
    clusterKey: z.string().min(1).max(191),
    windowStart: z.string(),
    windowEnd: z.string(),
    metrics: z
      .object({
        impressions: count,
        saves: count,
        pinClicks: count,
        outboundClicks: count,
        qualifiedConversions: z.number().int().nonnegative().nullable(),
      })
      .strict(),
    components: z
      .object({
        demand: z.number().int().min(0).max(100),
        contentFit: z.number().int().min(0).max(100),
        freshness: z.number().int().min(0).max(100),
        conversion: z.number().int().min(0).max(100).nullable(),
        evidenceConfidence: z.number().int().min(0).max(100),
        duplicationPenalty: z.number().int().min(0).max(100),
        concentrationPenalty: z.number().int().min(0).max(100),
        riskPenalty: z.number().int().min(0).max(100),
        cost: z.literal(null),
        costState: z.literal("NOT_APPLICABLE"),
      })
      .strict(),
    pinCount: z.number().int().min(0).max(500),
    distinctDestinationCount: z.number().int().min(0).max(500),
    activeWeekCount: z.number().int().min(0).max(4),
    velocityPercent: z.number().int().min(-1000).max(1000).nullable(),
    attributionCollection: z.enum(["COLLECTING", "NOT_COLLECTING"]),
    supportingPinterestPinIds: z.array(z.string().max(191)).max(20),
    context: z
      .object({
        boardCount: z.number().int().min(0).max(100),
        latestStrategyRecommendation: z.string().max(80).nullable(),
      })
      .strict(),
  })
  .strict()
  .superRefine((v, c) => {
    if (Buffer.byteLength(JSON.stringify(v), "utf8") > 48 * 1024)
      c.addIssue({
        code: "custom",
        message: "Opportunity evidence exceeds 48 KiB.",
      });
  });
export type OpportunityEvidence = z.infer<typeof opportunityEvidenceSchema>;

export const pinSignalEvidenceSchema = z
  .object({
    intelligenceModelVersion: z.literal(OPPORTUNITY_INTELLIGENCE_VERSION),
    type: z.nativeEnum(GrowthPinSignalType),
    strength: z.nativeEnum(GrowthSignalStrength),
    windowStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    windowEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    impressions: count,
    outboundClicks: count,
    recentImpressions: count,
    previousImpressions: count,
    recentOutboundClicks: count,
    previousOutboundClicks: count,
    impressionVelocityPercent: z.number().int().min(-1000).max(1000).nullable(),
    outboundVelocityPercent: z.number().int().min(-1000).max(1000).nullable(),
    ctrChangePercent: z.number().int().min(-1000).max(1000).nullable(),
    saveRateChangePercent: z.number().int().min(-1000).max(1000).nullable(),
    activeWeekCount: z.number().int().min(0).max(4),
    observationDays: z.number().int().min(0).max(28),
  })
  .strict();
