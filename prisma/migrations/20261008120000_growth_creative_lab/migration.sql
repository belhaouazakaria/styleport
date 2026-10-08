ALTER TYPE "GrowthJobType" ADD VALUE 'CREATIVE_LAB_GENERATE';

CREATE TYPE "GrowthCreativeDestinationKind" AS ENUM ('TRANSLATOR', 'IDEA');
CREATE TYPE "GrowthCreativeArchetype" AS ENUM ('V1_CONTROL', 'TYPOGRAPHY_LED', 'EDITORIAL_LIST', 'CONVERSATION_CHAT', 'MINIMAL_STATEMENT', 'BEFORE_AFTER', 'COMPARISON', 'QUIZ_PERSONALITY', 'SCENE_BASED');
CREATE TYPE "GrowthPinCandidateStatus" AS ENUM ('DRAFT', 'RENDERING', 'READY', 'DEFERRED', 'REJECTED', 'FAILED_RETRYABLE', 'FAILED_TERMINAL', 'CANCELLED');
CREATE TYPE "GrowthAssetGenerationKind" AS ENUM ('DETERMINISTIC', 'REUSED', 'AI');
CREATE TYPE "GrowthAssetState" AS ENUM ('READY', 'FAILED_RETRYABLE', 'FAILED_TERMINAL', 'RETIRED');
CREATE TYPE "GrowthCreativeSimilarityClassification" AS ENUM ('EXACT_DUPLICATE', 'NEAR_DUPLICATE', 'RELATED_DISTINCT', 'DISTINCT', 'INSUFFICIENT_DATA');
CREATE TYPE "GrowthExperimentDimension" AS ENUM ('ARCHETYPE', 'TEMPLATE', 'HEADLINE_PATTERN', 'CTA_PATTERN', 'VISUAL_TREATMENT');
CREATE TYPE "GrowthExperimentStatus" AS ENUM ('DRAFT', 'RUNNING', 'PAUSED', 'ANALYZING', 'COMPLETED', 'INCONCLUSIVE', 'CANCELLED', 'FAILED_TERMINAL');

CREATE TABLE "GrowthAsset" (
  "id" TEXT NOT NULL,
  "publicPath" VARCHAR(512) NOT NULL,
  "checksum" VARCHAR(64) NOT NULL,
  "mimeType" VARCHAR(32) NOT NULL,
  "width" INTEGER NOT NULL,
  "height" INTEGER NOT NULL,
  "byteSize" INTEGER NOT NULL,
  "rendererKey" VARCHAR(64) NOT NULL,
  "rendererVersion" VARCHAR(64) NOT NULL,
  "templateId" VARCHAR(96),
  "generationKind" "GrowthAssetGenerationKind" NOT NULL,
  "state" "GrowthAssetState" NOT NULL DEFAULT 'READY',
  "aiProvider" VARCHAR(80),
  "aiModel" VARCHAR(120),
  "aiResponseId" VARCHAR(191),
  "aiImageUnits" INTEGER,
  "estimatedCost" DECIMAL(12,6),
  "retainedUntil" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GrowthAsset_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GrowthExperiment" (
  "id" TEXT NOT NULL,
  "clusterId" TEXT,
  "hypothesis" VARCHAR(500) NOT NULL,
  "dimension" "GrowthExperimentDimension" NOT NULL,
  "variants" JSONB NOT NULL,
  "primaryKpi" VARCHAR(80) NOT NULL,
  "guardrails" JSONB NOT NULL,
  "attributionModelVersion" VARCHAR(80) NOT NULL,
  "scoringModelVersion" VARCHAR(80) NOT NULL,
  "experimentModelVersion" VARCHAR(80) NOT NULL,
  "status" "GrowthExperimentStatus" NOT NULL DEFAULT 'DRAFT',
  "startedAt" TIMESTAMP(3),
  "endedAt" TIMESTAMP(3),
  "result" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GrowthExperiment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GrowthPinCandidate" (
  "id" TEXT NOT NULL,
  "candidateKey" VARCHAR(191) NOT NULL,
  "revision" INTEGER NOT NULL,
  "accountId" TEXT,
  "boardId" TEXT,
  "clusterId" TEXT,
  "decisionId" TEXT,
  "experimentId" TEXT,
  "experimentVariantKey" VARCHAR(64),
  "generationJobId" TEXT,
  "destinationKind" "GrowthCreativeDestinationKind" NOT NULL,
  "translatorId" TEXT,
  "ideaId" TEXT,
  "title" VARCHAR(100) NOT NULL,
  "description" VARCHAR(500) NOT NULL,
  "destinationPath" VARCHAR(512) NOT NULL,
  "pinRef" VARCHAR(191),
  "assetId" TEXT NOT NULL,
  "rendererKey" VARCHAR(64) NOT NULL,
  "rendererVersion" VARCHAR(64) NOT NULL,
  "templateId" VARCHAR(96) NOT NULL,
  "archetype" "GrowthCreativeArchetype" NOT NULL,
  "headlinePattern" VARCHAR(96) NOT NULL,
  "ctaPattern" VARCHAR(96) NOT NULL,
  "visualTreatment" VARCHAR(96) NOT NULL,
  "topic" VARCHAR(160) NOT NULL,
  "contentHash" VARCHAR(64) NOT NULL,
  "similarityModelVersion" VARCHAR(64) NOT NULL,
  "similarityResult" "GrowthCreativeSimilarityClassification" NOT NULL,
  "similarityFlags" JSONB NOT NULL,
  "recommendedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "status" "GrowthPinCandidateStatus" NOT NULL DEFAULT 'DRAFT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GrowthPinCandidate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GrowthAsset_publicPath_key" ON "GrowthAsset"("publicPath");
CREATE INDEX "GrowthAsset_checksum_idx" ON "GrowthAsset"("checksum");
CREATE INDEX "GrowthAsset_generationKind_createdAt_idx" ON "GrowthAsset"("generationKind", "createdAt");
CREATE INDEX "GrowthAsset_state_retainedUntil_idx" ON "GrowthAsset"("state", "retainedUntil");
CREATE INDEX "GrowthExperiment_status_createdAt_idx" ON "GrowthExperiment"("status", "createdAt");
CREATE INDEX "GrowthExperiment_clusterId_createdAt_idx" ON "GrowthExperiment"("clusterId", "createdAt");
CREATE UNIQUE INDEX "GrowthPinCandidate_generationJobId_key" ON "GrowthPinCandidate"("generationJobId");
CREATE UNIQUE INDEX "GrowthPinCandidate_candidateKey_revision_key" ON "GrowthPinCandidate"("candidateKey", "revision");
CREATE INDEX "GrowthPinCandidate_status_recommendedAt_idx" ON "GrowthPinCandidate"("status", "recommendedAt");
CREATE INDEX "GrowthPinCandidate_destinationKind_translatorId_ideaId_createdAt_idx" ON "GrowthPinCandidate"("destinationKind", "translatorId", "ideaId", "createdAt");
CREATE INDEX "GrowthPinCandidate_contentHash_idx" ON "GrowthPinCandidate"("contentHash");
CREATE INDEX "GrowthPinCandidate_accountId_createdAt_idx" ON "GrowthPinCandidate"("accountId", "createdAt");
CREATE INDEX "GrowthPinCandidate_experimentId_experimentVariantKey_idx" ON "GrowthPinCandidate"("experimentId", "experimentVariantKey");
CREATE INDEX "GrowthPinCandidate_assetId_idx" ON "GrowthPinCandidate"("assetId");

ALTER TABLE "GrowthExperiment" ADD CONSTRAINT "GrowthExperiment_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES "GrowthContentCluster"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GrowthPinCandidate" ADD CONSTRAINT "GrowthPinCandidate_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "GrowthPinterestAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GrowthPinCandidate" ADD CONSTRAINT "GrowthPinCandidate_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "GrowthPinterestBoard"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GrowthPinCandidate" ADD CONSTRAINT "GrowthPinCandidate_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES "GrowthContentCluster"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GrowthPinCandidate" ADD CONSTRAINT "GrowthPinCandidate_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "GrowthDecision"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GrowthPinCandidate" ADD CONSTRAINT "GrowthPinCandidate_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "GrowthExperiment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GrowthPinCandidate" ADD CONSTRAINT "GrowthPinCandidate_generationJobId_fkey" FOREIGN KEY ("generationJobId") REFERENCES "GrowthJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GrowthPinCandidate" ADD CONSTRAINT "GrowthPinCandidate_translatorId_fkey" FOREIGN KEY ("translatorId") REFERENCES "Translator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GrowthPinCandidate" ADD CONSTRAINT "GrowthPinCandidate_ideaId_fkey" FOREIGN KEY ("ideaId") REFERENCES "GrowthIdea"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GrowthPinCandidate" ADD CONSTRAINT "GrowthPinCandidate_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "GrowthAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "GrowthAsset" ADD CONSTRAINT "GrowthAsset_checksum_check" CHECK ("checksum" ~ '^[a-f0-9]{64}$');
ALTER TABLE "GrowthAsset" ADD CONSTRAINT "GrowthAsset_dimensions_check" CHECK ("width" = 1000 AND "height" = 1500);
ALTER TABLE "GrowthAsset" ADD CONSTRAINT "GrowthAsset_byte_size_check" CHECK ("byteSize" > 0 AND "byteSize" <= 10485760);
ALTER TABLE "GrowthAsset" ADD CONSTRAINT "GrowthAsset_ai_metadata_check" CHECK (
  ("generationKind" = 'AI' AND "aiProvider" IS NOT NULL AND "aiProvider" <> '' AND "aiModel" IS NOT NULL AND "aiModel" <> '' AND "aiImageUnits" = 1 AND ("estimatedCost" IS NULL OR "estimatedCost" >= 0))
  OR ("generationKind" <> 'AI' AND "aiProvider" IS NULL AND "aiModel" IS NULL AND "aiResponseId" IS NULL AND "aiImageUnits" IS NULL AND "estimatedCost" IS NULL)
);
ALTER TABLE "GrowthExperiment" ADD CONSTRAINT "GrowthExperiment_variants_size_check" CHECK (octet_length("variants"::text) <= 16384);
ALTER TABLE "GrowthExperiment" ADD CONSTRAINT "GrowthExperiment_guardrails_size_check" CHECK (octet_length("guardrails"::text) <= 8192);
ALTER TABLE "GrowthExperiment" ADD CONSTRAINT "GrowthExperiment_result_size_check" CHECK ("result" IS NULL OR octet_length("result"::text) <= 16384);
ALTER TABLE "GrowthExperiment" ADD CONSTRAINT "GrowthExperiment_draft_state_check" CHECK (
  ("status" = 'DRAFT' AND "startedAt" IS NULL AND "endedAt" IS NULL AND "result" IS NULL)
  OR "status" <> 'DRAFT'
);
ALTER TABLE "GrowthPinCandidate" ADD CONSTRAINT "GrowthPinCandidate_revision_check" CHECK ("revision" > 0);
ALTER TABLE "GrowthPinCandidate" ADD CONSTRAINT "GrowthPinCandidate_content_hash_check" CHECK ("contentHash" ~ '^[a-f0-9]{64}$');
ALTER TABLE "GrowthPinCandidate" ADD CONSTRAINT "GrowthPinCandidate_destination_check" CHECK (
  ("destinationKind" = 'TRANSLATOR' AND "translatorId" IS NOT NULL AND "ideaId" IS NULL)
  OR ("destinationKind" = 'IDEA' AND "ideaId" IS NOT NULL AND "translatorId" IS NULL)
);
ALTER TABLE "GrowthPinCandidate" ADD CONSTRAINT "GrowthPinCandidate_experiment_variant_check" CHECK (
  ("experimentId" IS NULL AND "experimentVariantKey" IS NULL)
  OR ("experimentId" IS NOT NULL AND "experimentVariantKey" IS NOT NULL)
);
ALTER TABLE "GrowthPinCandidate" ADD CONSTRAINT "GrowthPinCandidate_similarity_size_check" CHECK (octet_length("similarityFlags"::text) <= 8192);
ALTER TABLE "GrowthPinCandidate" ADD CONSTRAINT "GrowthPinCandidate_destination_path_check" CHECK ("destinationPath" ~ '^/[A-Za-z0-9/_-]+$' AND "destinationPath" !~ '\.\.');
