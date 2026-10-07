-- Phase 8 adds versioned Translator decisions, mutations, and rollback history.
ALTER TYPE "GrowthJobType" ADD VALUE 'TRANSLATOR_AUTOPILOT_DECIDE';
ALTER TYPE "GrowthJobType" ADD VALUE 'TRANSLATOR_AUTOPILOT_EXECUTE';

CREATE TYPE "GrowthDecisionType" AS ENUM (
  'CREATE_TRANSLATOR',
  'IMPROVE_TRANSLATOR',
  'WAIT_FOR_MORE_DATA',
  'NO_ACTION'
);

CREATE TYPE "GrowthDecisionStatus" AS ENUM (
  'PROPOSED',
  'VALIDATING',
  'EXECUTING',
  'COMPLETED',
  'WAITING_DATA',
  'REJECTED',
  'CANCELLED',
  'FAILED_RETRYABLE',
  'FAILED_TERMINAL'
);

CREATE TYPE "GrowthContentVersionAction" AS ENUM ('CREATE', 'IMPROVE', 'ROLLBACK');
CREATE TYPE "GrowthContentSideEffectStatus" AS ENUM ('PENDING', 'SYNCHRONIZED', 'NOT_REQUIRED', 'FAILED_RETRYABLE');

CREATE TABLE "GrowthDecision" (
  "id" TEXT NOT NULL,
  "opportunityId" TEXT,
  "translatorId" TEXT,
  "executionJobId" TEXT,
  "type" "GrowthDecisionType" NOT NULL,
  "status" "GrowthDecisionStatus" NOT NULL DEFAULT 'PROPOSED',
  "decisionModelVersion" TEXT NOT NULL,
  "qualityModelVersion" TEXT NOT NULL,
  "dedupeModelVersion" TEXT NOT NULL,
  "evidence" JSONB NOT NULL,
  "reasonCodes" TEXT[] NOT NULL,
  "confidence" INTEGER NOT NULL,
  "expectedOutboundClicks" INTEGER,
  "expectedQualifiedConversions" INTEGER,
  "estimatedCost" DECIMAL(12,6),
  "actualOutcome" JSONB,
  "idempotencyKey" TEXT NOT NULL,
  "aiProvider" TEXT,
  "aiModel" TEXT,
  "aiResponseId" TEXT,
  "aiPromptTokens" INTEGER,
  "aiCompletionTokens" INTEGER,
  "aiTotalTokens" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "GrowthDecision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GrowthDecision_confidence_check" CHECK ("confidence" BETWEEN 0 AND 100),
  CONSTRAINT "GrowthDecision_expected_counts_check" CHECK (
    ("expectedOutboundClicks" IS NULL OR "expectedOutboundClicks" >= 0) AND
    ("expectedQualifiedConversions" IS NULL OR "expectedQualifiedConversions" >= 0)
  ),
  CONSTRAINT "GrowthDecision_idempotency_key_check" CHECK (char_length("idempotencyKey") BETWEEN 1 AND 191)
);

CREATE TABLE "GrowthContentVersion" (
  "id" TEXT NOT NULL,
  "translatorId" TEXT NOT NULL,
  "decisionId" TEXT,
  "jobId" TEXT,
  "sourceVersionId" TEXT,
  "version" INTEGER NOT NULL,
  "action" "GrowthContentVersionAction" NOT NULL,
  "actorKind" "GrowthActivityActorKind" NOT NULL,
  "decisionModelVersion" TEXT NOT NULL,
  "qualityModelVersion" TEXT NOT NULL,
  "dedupeModelVersion" TEXT NOT NULL,
  "sideEffectStatus" "GrowthContentSideEffectStatus" NOT NULL DEFAULT 'PENDING',
  "sideEffectError" TEXT,
  "sideEffectCompletedAt" TIMESTAMP(3),
  "beforeSnapshot" JSONB,
  "afterSnapshot" JSONB NOT NULL,
  "reason" TEXT NOT NULL,
  "checksum" TEXT NOT NULL,
  "mutationKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GrowthContentVersion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GrowthContentVersion_version_check" CHECK ("version" > 0),
  CONSTRAINT "GrowthContentVersion_checksum_check" CHECK (char_length("checksum") = 64),
  CONSTRAINT "GrowthContentVersion_reason_check" CHECK (char_length("reason") BETWEEN 1 AND 500),
  CONSTRAINT "GrowthContentVersion_mutation_key_check" CHECK (char_length("mutationKey") BETWEEN 1 AND 191),
  CONSTRAINT "GrowthContentVersion_side_effect_error_check" CHECK ("sideEffectError" IS NULL OR char_length("sideEffectError") <= 500)
);

CREATE UNIQUE INDEX "GrowthDecision_idempotencyKey_key" ON "GrowthDecision"("idempotencyKey");
CREATE INDEX "GrowthDecision_status_createdAt_idx" ON "GrowthDecision"("status", "createdAt");
CREATE INDEX "GrowthDecision_opportunityId_createdAt_idx" ON "GrowthDecision"("opportunityId", "createdAt");
CREATE INDEX "GrowthDecision_translatorId_createdAt_idx" ON "GrowthDecision"("translatorId", "createdAt");

CREATE UNIQUE INDEX "GrowthContentVersion_mutationKey_key" ON "GrowthContentVersion"("mutationKey");
CREATE UNIQUE INDEX "GrowthContentVersion_translatorId_version_key" ON "GrowthContentVersion"("translatorId", "version");
CREATE INDEX "GrowthContentVersion_translatorId_createdAt_idx" ON "GrowthContentVersion"("translatorId", "createdAt");
CREATE INDEX "GrowthContentVersion_decisionId_createdAt_idx" ON "GrowthContentVersion"("decisionId", "createdAt");
CREATE INDEX "GrowthContentVersion_checksum_idx" ON "GrowthContentVersion"("checksum");

ALTER TABLE "GrowthDecision" ADD CONSTRAINT "GrowthDecision_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "GrowthOpportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GrowthDecision" ADD CONSTRAINT "GrowthDecision_translatorId_fkey" FOREIGN KEY ("translatorId") REFERENCES "Translator"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GrowthDecision" ADD CONSTRAINT "GrowthDecision_executionJobId_fkey" FOREIGN KEY ("executionJobId") REFERENCES "GrowthJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GrowthContentVersion" ADD CONSTRAINT "GrowthContentVersion_translatorId_fkey" FOREIGN KEY ("translatorId") REFERENCES "Translator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GrowthContentVersion" ADD CONSTRAINT "GrowthContentVersion_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "GrowthDecision"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GrowthContentVersion" ADD CONSTRAINT "GrowthContentVersion_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "GrowthJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GrowthContentVersion" ADD CONSTRAINT "GrowthContentVersion_sourceVersionId_fkey" FOREIGN KEY ("sourceVersionId") REFERENCES "GrowthContentVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
