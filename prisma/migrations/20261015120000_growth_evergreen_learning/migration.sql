-- Phase 12: immutable evergreen recommendations and learning evidence.
ALTER TYPE "GrowthJobType" ADD VALUE 'EVERGREEN_LEARNING_ANALYSIS';
ALTER TYPE "GrowthJobType" ADD VALUE 'EVERGREEN_CREATIVE_PREPARE';

ALTER TABLE "GrowthSettings" ADD COLUMN "evergreenCooldownDays" INTEGER NOT NULL DEFAULT 45;
ALTER TABLE "GrowthSettings" ADD CONSTRAINT "GrowthSettings_evergreenCooldownDays_check" CHECK ("evergreenCooldownDays" BETWEEN 14 AND 180);

CREATE TYPE "GrowthEvergreenRecommendation" AS ENUM ('REVIVE', 'WAIT', 'SKIP', 'INSUFFICIENT_DATA');
CREATE TYPE "GrowthLearningEvidenceQuality" AS ENUM ('KNOWN', 'PARTIAL', 'INSUFFICIENT_DATA', 'STALE');
CREATE TYPE "GrowthEvergreenRecommendationStatus" AS ENUM ('PROPOSED', 'PREPARING', 'PREPARED', 'DISMISSED');

CREATE TABLE "GrowthLearningRun" (
  "id" TEXT NOT NULL,
  "analysisDate" TIMESTAMP(3) NOT NULL,
  "evidenceWindowStart" TIMESTAMP(3) NOT NULL,
  "evidenceWindowEnd" TIMESTAMP(3) NOT NULL,
  "learningModelVersion" VARCHAR(64) NOT NULL,
  "evergreenModelVersion" VARCHAR(64) NOT NULL,
  "schedulerModelVersion" VARCHAR(64) NOT NULL,
  "experimentModelVersion" VARCHAR(64) NOT NULL,
  "opportunityFeedbackVersion" VARCHAR(64) NOT NULL,
  "evidenceQuality" "GrowthLearningEvidenceQuality" NOT NULL,
  "attributionAvailability" VARCHAR(32) NOT NULL,
  "targetsConsidered" INTEGER NOT NULL,
  "recommendationsProduced" INTEGER NOT NULL,
  "reasonCodes" TEXT[],
  "performanceFindings" JSONB NOT NULL,
  "opportunityAdjustments" JSONB NOT NULL,
  "summary" VARCHAR(1000) NOT NULL,
  "jobId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GrowthLearningRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GrowthEvergreenRecommendationRecord" (
  "id" TEXT NOT NULL,
  "learningRunId" TEXT NOT NULL,
  "destinationKind" "GrowthCreativeDestinationKind" NOT NULL,
  "translatorId" TEXT,
  "ideaId" TEXT,
  "recommendation" "GrowthEvergreenRecommendation" NOT NULL,
  "status" "GrowthEvergreenRecommendationStatus" NOT NULL DEFAULT 'PROPOSED',
  "confidence" INTEGER NOT NULL,
  "evidenceQuality" "GrowthLearningEvidenceQuality" NOT NULL,
  "reasonCodes" TEXT[],
  "evidence" JSONB NOT NULL,
  "proposedArchetype" "GrowthCreativeArchetype",
  "proposedAngle" VARCHAR(160),
  "cooldownUntil" TIMESTAMP(3),
  "evidenceFreshThrough" TIMESTAMP(3),
  "preparedCandidateId" TEXT,
  "preparationJobId" TEXT,
  "creativeJobId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GrowthEvergreenRecommendationRecord_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GrowthEvergreenRecommendationRecord_target_check" CHECK (
    ("destinationKind" = 'TRANSLATOR' AND "translatorId" IS NOT NULL AND "ideaId" IS NULL) OR
    ("destinationKind" = 'IDEA' AND "ideaId" IS NOT NULL AND "translatorId" IS NULL)
  ),
  CONSTRAINT "GrowthEvergreenRecommendationRecord_confidence_check" CHECK ("confidence" BETWEEN 0 AND 100)
);

CREATE TABLE "GrowthLearnedScheduleWindow" (
  "id" TEXT NOT NULL,
  "learningRunId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "localHour" INTEGER NOT NULL,
  "timeZone" VARCHAR(64) NOT NULL,
  "mode" "GrowthPublicationTimingMode" NOT NULL,
  "confidence" INTEGER NOT NULL,
  "samplePins" INTEGER NOT NULL,
  "impressions" BIGINT NOT NULL,
  "outboundClicks" BIGINT NOT NULL,
  "saves" BIGINT NOT NULL,
  "qualifiedConversions" INTEGER,
  "evidenceQuality" "GrowthLearningEvidenceQuality" NOT NULL,
  "reasonCodes" TEXT[],
  "evidence" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GrowthLearnedScheduleWindow_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GrowthLearnedScheduleWindow_hour_check" CHECK ("localHour" BETWEEN 0 AND 23),
  CONSTRAINT "GrowthLearnedScheduleWindow_confidence_check" CHECK ("confidence" BETWEEN 0 AND 100),
  CONSTRAINT "GrowthLearnedScheduleWindow_counts_check" CHECK ("samplePins" >= 0 AND "impressions" >= 0 AND "outboundClicks" >= 0 AND "saves" >= 0 AND ("qualifiedConversions" IS NULL OR "qualifiedConversions" >= 0))
);

CREATE TABLE "GrowthExperimentLearningEvaluation" (
  "id" TEXT NOT NULL,
  "learningRunId" TEXT NOT NULL,
  "experimentId" TEXT NOT NULL,
  "outcome" "GrowthExperimentStatus" NOT NULL,
  "confidence" INTEGER NOT NULL,
  "evidenceQuality" "GrowthLearningEvidenceQuality" NOT NULL,
  "reasonCodes" TEXT[],
  "evidence" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GrowthExperimentLearningEvaluation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GrowthExperimentLearningEvaluation_confidence_check" CHECK ("confidence" BETWEEN 0 AND 100),
  CONSTRAINT "GrowthExperimentLearningEvaluation_outcome_check" CHECK ("outcome" IN ('COMPLETED', 'INCONCLUSIVE'))
);

CREATE UNIQUE INDEX "GrowthLearningRun_analysisDate_learningModelVersion_key" ON "GrowthLearningRun"("analysisDate", "learningModelVersion");
CREATE UNIQUE INDEX "GrowthLearningRun_jobId_key" ON "GrowthLearningRun"("jobId");
CREATE INDEX "GrowthLearningRun_completedAt_idx" ON "GrowthLearningRun"("completedAt");
CREATE UNIQUE INDEX "GrowthEvergreenRecommendationRecord_run_translator_key" ON "GrowthEvergreenRecommendationRecord"("learningRunId", "translatorId") WHERE "translatorId" IS NOT NULL;
CREATE UNIQUE INDEX "GrowthEvergreenRecommendationRecord_run_idea_key" ON "GrowthEvergreenRecommendationRecord"("learningRunId", "ideaId") WHERE "ideaId" IS NOT NULL;
CREATE UNIQUE INDEX "GrowthEvergreenRecommendationRecord_preparedCandidateId_key" ON "GrowthEvergreenRecommendationRecord"("preparedCandidateId");
CREATE UNIQUE INDEX "GrowthEvergreenRecommendationRecord_preparationJobId_key" ON "GrowthEvergreenRecommendationRecord"("preparationJobId");
CREATE UNIQUE INDEX "GrowthEvergreenRecommendationRecord_creativeJobId_key" ON "GrowthEvergreenRecommendationRecord"("creativeJobId");
CREATE INDEX "GrowthEvergreenRecommendationRecord_recommendation_status_c_idx" ON "GrowthEvergreenRecommendationRecord"("recommendation", "status", "confidence", "createdAt");
CREATE INDEX "GrowthEvergreenRecommendationRecord_translatorId_createdAt_idx" ON "GrowthEvergreenRecommendationRecord"("translatorId", "createdAt");
CREATE INDEX "GrowthEvergreenRecommendationRecord_ideaId_createdAt_idx" ON "GrowthEvergreenRecommendationRecord"("ideaId", "createdAt");
CREATE UNIQUE INDEX "GrowthLearnedScheduleWindow_learningRunId_accountId_localHo_key" ON "GrowthLearnedScheduleWindow"("learningRunId", "accountId", "localHour");
CREATE INDEX "GrowthLearnedScheduleWindow_accountId_evidenceQuality_confi_idx" ON "GrowthLearnedScheduleWindow"("accountId", "evidenceQuality", "confidence");
CREATE UNIQUE INDEX "GrowthExperimentLearningEvaluation_learningRunId_experiment_key" ON "GrowthExperimentLearningEvaluation"("learningRunId", "experimentId");
CREATE INDEX "GrowthExperimentLearningEvaluation_experimentId_createdAt_idx" ON "GrowthExperimentLearningEvaluation"("experimentId", "createdAt");

ALTER TABLE "GrowthLearningRun" ADD CONSTRAINT "GrowthLearningRun_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "GrowthJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GrowthEvergreenRecommendationRecord" ADD CONSTRAINT "GrowthEvergreenRecommendationRecord_learningRunId_fkey" FOREIGN KEY ("learningRunId") REFERENCES "GrowthLearningRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GrowthEvergreenRecommendationRecord" ADD CONSTRAINT "GrowthEvergreenRecommendationRecord_translatorId_fkey" FOREIGN KEY ("translatorId") REFERENCES "Translator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GrowthEvergreenRecommendationRecord" ADD CONSTRAINT "GrowthEvergreenRecommendationRecord_ideaId_fkey" FOREIGN KEY ("ideaId") REFERENCES "GrowthIdea"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GrowthEvergreenRecommendationRecord" ADD CONSTRAINT "GrowthEvergreenRecommendationRecord_preparedCandidateId_fkey" FOREIGN KEY ("preparedCandidateId") REFERENCES "GrowthPinCandidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GrowthEvergreenRecommendationRecord" ADD CONSTRAINT "GrowthEvergreenRecommendationRecord_preparationJobId_fkey" FOREIGN KEY ("preparationJobId") REFERENCES "GrowthJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GrowthEvergreenRecommendationRecord" ADD CONSTRAINT "GrowthEvergreenRecommendationRecord_creativeJobId_fkey" FOREIGN KEY ("creativeJobId") REFERENCES "GrowthJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GrowthLearnedScheduleWindow" ADD CONSTRAINT "GrowthLearnedScheduleWindow_learningRunId_fkey" FOREIGN KEY ("learningRunId") REFERENCES "GrowthLearningRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GrowthLearnedScheduleWindow" ADD CONSTRAINT "GrowthLearnedScheduleWindow_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "GrowthPinterestAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GrowthExperimentLearningEvaluation" ADD CONSTRAINT "GrowthExperimentLearningEvaluation_learningRunId_fkey" FOREIGN KEY ("learningRunId") REFERENCES "GrowthLearningRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GrowthExperimentLearningEvaluation" ADD CONSTRAINT "GrowthExperimentLearningEvaluation_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "GrowthExperiment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
