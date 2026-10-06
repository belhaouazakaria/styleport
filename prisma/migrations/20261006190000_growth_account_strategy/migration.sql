-- Phase 6 adds deterministic, advisory account strategy reviews. It performs no Pinterest mutations.
ALTER TYPE "GrowthJobType" ADD VALUE 'ACCOUNT_STRATEGY_REVIEW';

CREATE TYPE "GrowthAccountStrategyRecommendation" AS ENUM (
  'KEEP_CURRENT_PORTFOLIO',
  'COMPLETE_BASELINE_PORTFOLIO',
  'REPOSITION_EXISTING_ROLE',
  'RECOMMEND_NEW_ACCOUNT',
  'WAIT_FOR_MORE_DATA'
);

CREATE TYPE "GrowthStrategyEvidenceQuality" AS ENUM (
  'KNOWN',
  'UNKNOWN',
  'INSUFFICIENT_DATA',
  'NOT_APPLICABLE'
);

CREATE TABLE "GrowthAccountStrategyReview" (
  "id" TEXT NOT NULL,
  "reviewMonth" TIMESTAMP(3) NOT NULL,
  "evidenceWindowStart" TIMESTAMP(3) NOT NULL,
  "evidenceWindowEnd" TIMESTAMP(3) NOT NULL,
  "modelVersion" TEXT NOT NULL,
  "recommendation" "GrowthAccountStrategyRecommendation" NOT NULL,
  "plannedAccountCount" INTEGER NOT NULL,
  "connectedAccountCount" INTEGER NOT NULL,
  "recommendedAccountCount" INTEGER NOT NULL,
  "confidence" INTEGER NOT NULL,
  "evidenceQuality" "GrowthStrategyEvidenceQuality" NOT NULL,
  "evidence" JSONB NOT NULL,
  "reasonCodes" TEXT[] NOT NULL,
  "recommendationSummary" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GrowthAccountStrategyReview_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GrowthAccountStrategyReview_confidence_check" CHECK ("confidence" BETWEEN 0 AND 100),
  CONSTRAINT "GrowthAccountStrategyReview_counts_check" CHECK (
    "plannedAccountCount" >= 0 AND
    "connectedAccountCount" >= 0 AND
    "recommendedAccountCount" >= 0
  ),
  CONSTRAINT "GrowthAccountStrategyReview_summary_length_check" CHECK (char_length("recommendationSummary") BETWEEN 1 AND 500)
);

CREATE UNIQUE INDEX "GrowthAccountStrategyReview_reviewMonth_modelVersion_key"
  ON "GrowthAccountStrategyReview"("reviewMonth", "modelVersion");
CREATE INDEX "GrowthAccountStrategyReview_recommendation_reviewMonth_idx"
  ON "GrowthAccountStrategyReview"("recommendation", "reviewMonth");
CREATE INDEX "GrowthAccountStrategyReview_completedAt_idx"
  ON "GrowthAccountStrategyReview"("completedAt");
