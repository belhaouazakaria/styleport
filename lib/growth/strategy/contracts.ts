import {
  GrowthAccountStrategyRecommendation,
  GrowthPinterestPublicationRole,
  GrowthStrategyEvidenceQuality,
} from "@prisma/client";
import { z } from "zod";

export const accountHealthStatusSchema = z.enum([
  "HEALTHY",
  "NEEDS_ATTENTION",
  "INSUFFICIENT_DATA",
  "NOT_CONNECTED",
  "REAUTH_REQUIRED",
]);
export const roleReadinessSchema = z.enum([
  "READY",
  "PARTIAL",
  "NOT_CONNECTED",
  "BLOCKED",
  "INSUFFICIENT_DATA",
]);
export const intentAlignmentSchema = z.enum([
  "ALIGNED",
  "MIXED",
  "MISALIGNED",
  "INSUFFICIENT_DATA",
]);
export const boardEligibilitySchema = z.enum([
  "ELIGIBLE",
  "NEEDS_REVIEW",
  "NOT_ELIGIBLE",
  "INSUFFICIENT_DATA",
]);
export const metricEvidenceStateSchema = z.enum([
  "KNOWN",
  "UNKNOWN",
  "INSUFFICIENT_DATA",
  "NOT_APPLICABLE",
]);
export const attributionCollectionStateSchema = z.enum([
  "COLLECTING",
  "NOT_COLLECTING",
]);

export const strategyReasonCodeSchema = z.enum([
  "BASELINE_PORTFOLIO_INCOMPLETE",
  "THREE_ROLE_MODEL_STILL_APPROPRIATE",
  "NO_EXPANSION_EVIDENCE",
  "FUTURE_CLUSTER_EVIDENCE_REQUIRED",
  "ROLE_NOT_CONNECTED",
  "ROLE_REAUTH_REQUIRED",
  "MISSING_REQUIRED_SCOPES",
  "ACCOUNT_SYNC_STALE",
  "BOARD_SYNC_STALE",
  "ANALYTICS_MISSING",
  "ANALYTICS_STALE",
  "INSUFFICIENT_OBSERVATION_WINDOW",
  "INVENTORY_EMPTY",
  "INVENTORY_INCOMPLETE",
  "INSUFFICIENT_RELEVANT_PINS",
  "ATTRIBUTION_NOT_COLLECTING",
  "HIGH_TOP_PIN_CONCENTRATION",
  "BOARD_COVERAGE_LOW",
  "BOARD_INACTIVE",
  "BOARD_NOT_PUBLIC",
  "BOARD_HAS_NO_PINS",
  "BOARD_RELEVANCE_UNCLEAR",
  "INTENT_MIXED",
  "INTENT_MISALIGNED",
]);

const countStringSchema = z.string().regex(/^\d+$/).max(40);
const optionalDateSchema = z.string().datetime().nullable();
const reasonsSchema = z.array(strategyReasonCodeSchema).max(24);

export const strategyMetricsSchema = z
  .object({
    state: metricEvidenceStateSchema,
    observationDays: z.number().int().min(0).max(28),
    impressions: countStringSchema.nullable(),
    saves: countStringSchema.nullable(),
    pinClicks: countStringSchema.nullable(),
    outboundClicks: countStringSchema.nullable(),
    outboundCtrPercent: z.number().min(0).max(10_000).nullable(),
  })
  .strict();

export const roleStrategySchema = z
  .object({
    role: z.nativeEnum(GrowthPinterestPublicationRole),
    label: z.string().min(1).max(80),
    intent: z.enum(["UTILITY", "INSPIRATION", "PLAYGROUND"]),
    purpose: z.string().min(1).max(160),
    accountId: z.string().max(191).nullable(),
    username: z.string().max(191).nullable(),
    connectionStatus: z.string().max(40).nullable(),
    health: accountHealthStatusSchema,
    readiness: roleReadinessSchema,
    evidenceQuality: z.nativeEnum(GrowthStrategyEvidenceQuality),
    requiredScopesComplete: z.boolean().nullable(),
    lastSuccessfulApiCallAt: optionalDateSchema,
    lastAccountSyncAt: optionalDateSchema,
    lastBoardSyncAt: optionalDateSchema,
    analyticsStatus: z.string().max(40).nullable(),
    lastAnalyticsSyncAt: optionalDateSchema,
    activePins: z.number().int().min(0).max(1_000_000).nullable(),
    relevantPins: z.number().int().min(0).max(1_000_000).nullable(),
    boardCount: z.number().int().min(0).max(10_000).nullable(),
    metrics: strategyMetricsSchema,
    attributionCollection: attributionCollectionStateSchema,
    qualifiedConversions: countStringSchema.nullable(),
    qualifiedConversionEvidence: metricEvidenceStateSchema,
    alignment: z
      .object({
        status: intentAlignmentSchema,
        consideredPins: z.number().int().min(0).max(2_500),
        alignedPins: z.number().int().min(0).max(2_500),
        reasons: reasonsSchema,
      })
      .strict(),
    reasonCodes: reasonsSchema,
    recommendedAction: z.string().min(1).max(300),
  })
  .strict();

export const boardStrategySchema = z
  .object({
    accountRole: z.nativeEnum(GrowthPinterestPublicationRole),
    accountUsername: z.string().max(191),
    pinterestBoardId: z.string().max(191),
    name: z.string().max(500),
    privacy: z.string().max(80).nullable(),
    active: z.boolean(),
    pinCount: z.number().int().min(0).max(1_000_000),
    relevantPinCount: z.number().int().min(0).max(1_000_000),
    metrics: strategyMetricsSchema,
    eligibility: boardEligibilitySchema,
    reasonCodes: reasonsSchema,
    lastSyncedAt: z.string().datetime(),
  })
  .strict();

export const concentrationEvidenceSchema = z
  .object({
    role: z.nativeEnum(GrowthPinterestPublicationRole),
    contributingPins: z.number().int().min(0).max(2_500),
    topPinOutboundSharePercent: z.number().min(0).max(100).nullable(),
    topThreeOutboundSharePercent: z.number().min(0).max(100).nullable(),
    topPinImpressionSharePercent: z.number().min(0).max(100).nullable(),
    topThreeImpressionSharePercent: z.number().min(0).max(100).nullable(),
  })
  .strict();

export const accountStrategyEvidenceSchema = z
  .object({
    modelVersion: z.literal("account_strategy_v1"),
    reviewMonth: z.string().regex(/^\d{4}-\d{2}$/),
    evidenceWindowStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    evidenceWindowEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    attributionCapability: z.literal("AVAILABLE"),
    attributionCollection: attributionCollectionStateSchema,
    roles: z.array(roleStrategySchema).length(3),
    boards: z.array(boardStrategySchema).max(100),
    concentration: z.array(concentrationEvidenceSchema).max(3),
    portfolio: z
      .object({
        plannedRoles: z.literal(3),
        connectedRoles: z.number().int().min(0).max(3),
        healthyRoles: z.number().int().min(0).max(3),
        rolesNeedingAttention: z.number().int().min(0).max(3),
        rolesWithoutEnoughData: z.number().int().min(0).max(3),
        readiness: roleReadinessSchema,
        recommendation: z.nativeEnum(GrowthAccountStrategyRecommendation),
        recommendedAccountCount: z.number().int().min(0).max(20),
        confidence: z.number().int().min(0).max(100),
        evidenceQuality: z.nativeEnum(GrowthStrategyEvidenceQuality),
        reasonCodes: reasonsSchema,
        summary: z.string().min(1).max(500),
      })
      .strict(),
  })
  .strict()
  .superRefine((value, context) => {
    if (Buffer.byteLength(JSON.stringify(value), "utf8") > 64 * 1_024) {
      context.addIssue({
        code: "custom",
        message: "Account strategy evidence exceeds 64 KiB.",
      });
    }
  });

export const accountStrategyJobPayloadSchema = z
  .object({
    reviewMonth: z.string().regex(/^\d{4}-\d{2}$/),
    evidenceWindowEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    modelVersion: z.literal("account_strategy_v1"),
  })
  .strict();

export type AccountHealthStatus = z.infer<typeof accountHealthStatusSchema>;
export type RoleReadiness = z.infer<typeof roleReadinessSchema>;
export type IntentAlignment = z.infer<typeof intentAlignmentSchema>;
export type BoardEligibility = z.infer<typeof boardEligibilitySchema>;
export type StrategyReasonCode = z.infer<typeof strategyReasonCodeSchema>;
export type StrategyMetrics = z.infer<typeof strategyMetricsSchema>;
export type RoleStrategy = z.infer<typeof roleStrategySchema>;
export type BoardStrategy = z.infer<typeof boardStrategySchema>;
export type ConcentrationEvidence = z.infer<typeof concentrationEvidenceSchema>;
export type AccountStrategyEvidence = z.infer<
  typeof accountStrategyEvidenceSchema
>;
