import { GrowthJobType, type GrowthJob } from "@prisma/client";
import { z } from "zod";

import { NonRetryableGrowthJobError } from "@/lib/growth/errors";
import { analyticsDateRange } from "@/lib/growth/pinterest/analytics-contract";
import {
  syncPinterestAccountAnalytics,
  syncPinterestPinAnalytics,
  syncPinterestPinInventory,
} from "@/lib/growth/pinterest/analytics";
import {
  syncPinterestAccount,
  syncPinterestBoards,
} from "@/lib/growth/pinterest/sync";
import { attributionRetentionJobPayloadSchema } from "@/lib/growth/attribution/contracts";
import { cleanupAttributionDetail } from "@/lib/growth/attribution/retention";
import { accountStrategyJobPayloadSchema } from "@/lib/growth/strategy/contracts";
import { persistAccountStrategyReview } from "@/lib/growth/strategy/review";
import { persistOpportunityAnalysis } from "@/lib/growth/opportunity/analysis";
import { opportunityJobPayloadSchema } from "@/lib/growth/opportunity/contracts";
import {
  translatorDecisionJobPayloadSchema,
  translatorExecutionJobPayloadSchema,
} from "@/lib/growth/translator/contracts";
import {
  decideTranslatorOpportunity,
  executeTranslatorDecision,
} from "@/lib/growth/translator/service";

export interface GrowthJobHandlerContext {
  job: GrowthJob;
}

export type GrowthJobHandler = (
  context: GrowthJobHandlerContext,
) => Promise<Record<string, unknown>>;

const handlers = new Map<GrowthJobType, GrowthJobHandler>([
  [
    GrowthJobType.FOUNDATION_NOOP,
    async ({ job }) => ({ handled: true, type: job.type }),
  ],
  [
    GrowthJobType.PINTEREST_ACCOUNT_SYNC,
    async ({ job }) => {
      const payload = parsePinterestSyncPayload(job.payload);
      return syncPinterestAccount(payload.accountId);
    },
  ],
  [
    GrowthJobType.PINTEREST_BOARD_SYNC,
    async ({ job }) => {
      const payload = parsePinterestSyncPayload(job.payload);
      return syncPinterestBoards(payload.accountId);
    },
  ],
  [
    GrowthJobType.PINTEREST_PIN_INVENTORY_SYNC,
    async ({ job }) => {
      const payload = parsePinterestAnalyticsPayload(job.payload);
      return syncPinterestPinInventory(payload);
    },
  ],
  [
    GrowthJobType.PINTEREST_ACCOUNT_ANALYTICS_SYNC,
    async ({ job }) => {
      const payload = parsePinterestAnalyticsPayload(job.payload);
      return syncPinterestAccountAnalytics(payload);
    },
  ],
  [
    GrowthJobType.PINTEREST_PIN_ANALYTICS_SYNC,
    async ({ job }) => {
      const payload = parsePinterestAnalyticsPayload(job.payload, true);
      return syncPinterestPinAnalytics({
        ...payload,
        batch: payload.batch || 0,
      });
    },
  ],
  [
    GrowthJobType.ATTRIBUTION_RETENTION_CLEANUP,
    async ({ job }) => {
      const parsed = attributionRetentionJobPayloadSchema.safeParse(
        job.payload || {},
      );
      if (!parsed.success)
        throw new NonRetryableGrowthJobError(
          "Invalid attribution retention job payload.",
        );
      return cleanupAttributionDetail({ limit: parsed.data.limit });
    },
  ],
  [
    GrowthJobType.ACCOUNT_STRATEGY_REVIEW,
    async ({ job }) => {
      const parsed = accountStrategyJobPayloadSchema.safeParse(
        job.payload || {},
      );
      if (!parsed.success)
        throw new NonRetryableGrowthJobError(
          "Invalid account strategy review payload.",
        );
      const reviewMonth = new Date(
        `${parsed.data.reviewMonth}-01T00:00:00.000Z`,
      );
      const evidenceWindowEnd = new Date(
        `${parsed.data.evidenceWindowEnd}T00:00:00.000Z`,
      );
      if (
        Number.isNaN(reviewMonth.getTime()) ||
        Number.isNaN(evidenceWindowEnd.getTime())
      ) {
        throw new NonRetryableGrowthJobError(
          "Invalid account strategy review period.",
        );
      }
      const evidenceWindowStart = new Date(evidenceWindowEnd);
      evidenceWindowStart.setUTCDate(evidenceWindowStart.getUTCDate() - 27);
      const result = await persistAccountStrategyReview({
        reviewMonth,
        evidenceWindowStart,
        evidenceWindowEnd,
      });
      return {
        reviewId: result.review.id,
        period: parsed.data.reviewMonth,
        recommendation: result.review.recommendation,
        connectedCount: result.review.connectedAccountCount,
        confidence: result.review.confidence,
        modelVersion: result.review.modelVersion,
      };
    },
  ],
  [
    GrowthJobType.OPPORTUNITY_INTELLIGENCE_ANALYSIS,
    async ({ job }) => {
      const parsed = opportunityJobPayloadSchema.safeParse(job.payload || {});
      if (!parsed.success)
        throw new NonRetryableGrowthJobError(
          "Invalid opportunity intelligence payload.",
        );
      const analysisDate = new Date(
        `${parsed.data.analysisDate}T00:00:00.000Z`,
      );
      if (Number.isNaN(analysisDate.getTime()))
        throw new NonRetryableGrowthJobError(
          "Invalid opportunity intelligence analysis date.",
        );
      const evidenceWindowEnd = new Date(analysisDate);
      evidenceWindowEnd.setUTCDate(evidenceWindowEnd.getUTCDate() - 1);
      const evidenceWindowStart = new Date(evidenceWindowEnd);
      evidenceWindowStart.setUTCDate(evidenceWindowStart.getUTCDate() - 27);
      const result = await persistOpportunityAnalysis({
        analysisDate,
        evidenceWindowStart,
        evidenceWindowEnd,
      });
      return {
        analysisRunId: result.run.id,
        modelVersion: result.run.intelligenceModelVersion,
        evidenceQuality: result.run.evidenceQuality,
        pinsConsidered: result.run.pinsConsidered,
        opportunities: result.run.opportunitiesProduced,
      };
    },
  ],
  [
    GrowthJobType.TRANSLATOR_AUTOPILOT_DECIDE,
    async ({ job }) => {
      const parsed = translatorDecisionJobPayloadSchema.safeParse(job.payload || {});
      if (!parsed.success) throw new NonRetryableGrowthJobError("Invalid Translator Autopilot decision payload.");
      const result = await decideTranslatorOpportunity(parsed.data.opportunityId);
      return {
        decisionId: result.decision.id,
        decisionType: result.decision.type,
        status: result.decision.status,
        executionJobId: result.execution?.job.id || null,
        modelVersion: result.decision.decisionModelVersion,
      };
    },
  ],
  [
    GrowthJobType.TRANSLATOR_AUTOPILOT_EXECUTE,
    async ({ job }) => {
      const parsed = translatorExecutionJobPayloadSchema.safeParse(job.payload || {});
      if (!parsed.success) throw new NonRetryableGrowthJobError("Invalid Translator Autopilot execution payload.");
      const result = await executeTranslatorDecision(parsed.data.decisionId, { jobId: job.id });
      return {
        decisionId: result.decision.id,
        status: result.decision.status,
        translatorId: "translatorId" in result ? result.translatorId : result.decision.translatorId,
        reused: result.reused,
      };
    },
  ],
]);

function parsePinterestSyncPayload(payload: unknown) {
  const parsed = z
    .object({ accountId: z.string().min(1) })
    .strict()
    .safeParse(payload);
  if (!parsed.success)
    throw new NonRetryableGrowthJobError(
      "Invalid Pinterest synchronization job payload.",
    );
  return parsed.data;
}

function parsePinterestAnalyticsPayload(
  payload: unknown,
  requireBatch = false,
) {
  const parsed = z
    .object({
      accountId: z.string().min(1),
      startDate: z.string(),
      endDate: z.string(),
      runStartedAt: z.string().datetime({ offset: true }),
      batch: z.number().int().min(0).max(10_000).optional(),
      relevancePrepared: z.boolean().optional(),
    })
    .strict()
    .safeParse(payload);
  if (!parsed.success || (requireBatch && parsed.data.batch === undefined)) {
    throw new NonRetryableGrowthJobError(
      "Invalid Pinterest analytics job payload.",
    );
  }
  try {
    analyticsDateRange(parsed.data);
  } catch {
    throw new NonRetryableGrowthJobError(
      "Invalid Pinterest analytics date range.",
    );
  }
  return parsed.data;
}

export async function dispatchGrowthJob(job: GrowthJob) {
  const handler = handlers.get(job.type);
  if (!handler)
    throw new Error(`Unsupported Growth job type: ${String(job.type)}`);
  return handler({ job });
}
