-- Phase 7 adds deterministic opportunity intelligence over locally persisted evidence.
ALTER TYPE "GrowthJobType" ADD VALUE 'OPPORTUNITY_INTELLIGENCE_ANALYSIS';
CREATE TYPE "GrowthOpportunityType" AS ENUM ('AMPLIFY_WINNER','EXPLORE_RISING_TOPIC','FILL_INVENTORY_GAP','INVESTIGATE_FATIGUE','HIGH_CONVERSION_LOW_REACH','HIGH_CLICK_LOW_CONVERSION');
CREATE TYPE "GrowthOpportunityStatus" AS ENUM ('OPEN','EVALUATING','ACTIONED','DEFERRED','DISMISSED','CANCELLED','FAILED_RETRYABLE','FAILED_TERMINAL');
CREATE TYPE "GrowthOpportunityEvidenceQuality" AS ENUM ('KNOWN','PARTIAL','INSUFFICIENT_DATA','STALE','NOT_APPLICABLE');
CREATE TYPE "GrowthContentClusterStatus" AS ENUM ('ACTIVE','INSUFFICIENT_DATA','ARCHIVED');
CREATE TYPE "GrowthOpportunityDestinationKind" AS ENUM ('TRANSLATOR','FUTURE_IDEAS','MULTIPLE','UNKNOWN');

CREATE TABLE "GrowthOpportunityAnalysisRun" (
 "id" TEXT NOT NULL, "analysisDate" TIMESTAMP(3) NOT NULL, "evidenceWindowStart" TIMESTAMP(3) NOT NULL, "evidenceWindowEnd" TIMESTAMP(3) NOT NULL,
 "intelligenceModelVersion" TEXT NOT NULL, "scoringModelVersion" TEXT NOT NULL, "clusteringModelVersion" TEXT NOT NULL,
 "evidenceQuality" "GrowthOpportunityEvidenceQuality" NOT NULL, "pinsConsidered" INTEGER NOT NULL, "pinCap" INTEGER NOT NULL, "capReached" BOOLEAN NOT NULL DEFAULT false,
 "clustersProduced" INTEGER NOT NULL, "opportunitiesProduced" INTEGER NOT NULL, "attributionCollection" TEXT NOT NULL, "reasonCodes" TEXT[] NOT NULL, "summary" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "GrowthOpportunityAnalysisRun_pkey" PRIMARY KEY ("id"), CONSTRAINT "GrowthOpportunityAnalysisRun_counts_check" CHECK ("pinsConsidered" >= 0 AND "pinCap" BETWEEN 1 AND 500 AND "clustersProduced" >= 0 AND "opportunitiesProduced" >= 0), CONSTRAINT "GrowthOpportunityAnalysisRun_summary_check" CHECK (char_length("summary") BETWEEN 1 AND 500)
);
CREATE UNIQUE INDEX "GrowthOpportunityAnalysisRun_analysisDate_intelligenceModelVersion_key" ON "GrowthOpportunityAnalysisRun"("analysisDate","intelligenceModelVersion");
CREATE INDEX "GrowthOpportunityAnalysisRun_completedAt_idx" ON "GrowthOpportunityAnalysisRun"("completedAt");

CREATE TABLE "GrowthContentCluster" (
 "id" TEXT NOT NULL, "clusterKey" TEXT NOT NULL, "name" TEXT NOT NULL, "clusteringVersion" TEXT NOT NULL, "targetRole" "GrowthPinterestPublicationRole", "status" "GrowthContentClusterStatus" NOT NULL DEFAULT 'ACTIVE', "summary" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "GrowthContentCluster_pkey" PRIMARY KEY ("id"), CONSTRAINT "GrowthContentCluster_key_check" CHECK (char_length("clusterKey") BETWEEN 1 AND 191), CONSTRAINT "GrowthContentCluster_name_check" CHECK (char_length("name") BETWEEN 1 AND 120)
);
CREATE UNIQUE INDEX "GrowthContentCluster_clusterKey_clusteringVersion_key" ON "GrowthContentCluster"("clusterKey","clusteringVersion");
CREATE INDEX "GrowthContentCluster_status_updatedAt_idx" ON "GrowthContentCluster"("status","updatedAt");

CREATE TABLE "GrowthContentClusterSnapshot" (
 "id" TEXT NOT NULL, "analysisRunId" TEXT NOT NULL, "clusterId" TEXT NOT NULL, "pinCount" INTEGER NOT NULL, "distinctDestinationCount" INTEGER NOT NULL, "activeWeekCount" INTEGER NOT NULL,
 "impressions" BIGINT NOT NULL, "saves" BIGINT NOT NULL, "pinClicks" BIGINT NOT NULL, "outboundClicks" BIGINT NOT NULL, "qualifiedConversions" INTEGER,
 "topPinImpressionPercent" INTEGER, "topThreeImpressionPercent" INTEGER, "topPinOutboundPercent" INTEGER, "topThreeOutboundPercent" INTEGER, "velocityPercent" INTEGER,
 "evidenceQuality" "GrowthOpportunityEvidenceQuality" NOT NULL, "reasonCodes" TEXT[] NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "GrowthContentClusterSnapshot_pkey" PRIMARY KEY ("id"), CONSTRAINT "GrowthContentClusterSnapshot_counts_check" CHECK ("pinCount" >= 0 AND "distinctDestinationCount" >= 0 AND "activeWeekCount" BETWEEN 0 AND 4)
);
CREATE UNIQUE INDEX "GrowthContentClusterSnapshot_analysisRunId_clusterId_key" ON "GrowthContentClusterSnapshot"("analysisRunId","clusterId");
CREATE INDEX "GrowthContentClusterSnapshot_clusterId_createdAt_idx" ON "GrowthContentClusterSnapshot"("clusterId","createdAt");

CREATE TABLE "GrowthContentClusterMembership" (
 "id" TEXT NOT NULL, "snapshotId" TEXT NOT NULL, "pinId" TEXT, "translatorId" TEXT, "pinterestPinId" TEXT NOT NULL, "destinationPath" TEXT, "matchTokens" TEXT[] NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "GrowthContentClusterMembership_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GrowthContentClusterMembership_snapshotId_pinterestPinId_key" ON "GrowthContentClusterMembership"("snapshotId","pinterestPinId");
CREATE INDEX "GrowthContentClusterMembership_pinId_idx" ON "GrowthContentClusterMembership"("pinId");
CREATE INDEX "GrowthContentClusterMembership_translatorId_idx" ON "GrowthContentClusterMembership"("translatorId");

CREATE TABLE "GrowthOpportunity" (
 "id" TEXT NOT NULL, "analysisRunId" TEXT NOT NULL, "clusterId" TEXT, "type" "GrowthOpportunityType" NOT NULL, "status" "GrowthOpportunityStatus" NOT NULL DEFAULT 'OPEN', "score" INTEGER NOT NULL, "confidence" INTEGER NOT NULL,
 "evidenceQuality" "GrowthOpportunityEvidenceQuality" NOT NULL, "scoringModelVersion" TEXT NOT NULL, "clusteringModelVersion" TEXT NOT NULL, "targetRole" "GrowthPinterestPublicationRole", "targetDestinationKind" "GrowthOpportunityDestinationKind",
 "evidence" JSONB NOT NULL, "reasonCodes" TEXT[] NOT NULL, "dedupeKey" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "closedAt" TIMESTAMP(3),
 CONSTRAINT "GrowthOpportunity_pkey" PRIMARY KEY ("id"), CONSTRAINT "GrowthOpportunity_score_check" CHECK ("score" BETWEEN 0 AND 100 AND "confidence" BETWEEN 0 AND 100)
);
CREATE UNIQUE INDEX "GrowthOpportunity_dedupeKey_key" ON "GrowthOpportunity"("dedupeKey");
CREATE INDEX "GrowthOpportunity_status_score_createdAt_idx" ON "GrowthOpportunity"("status","score","createdAt");
CREATE INDEX "GrowthOpportunity_type_createdAt_idx" ON "GrowthOpportunity"("type","createdAt");

ALTER TABLE "GrowthContentClusterSnapshot" ADD CONSTRAINT "GrowthContentClusterSnapshot_analysisRunId_fkey" FOREIGN KEY ("analysisRunId") REFERENCES "GrowthOpportunityAnalysisRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GrowthContentClusterSnapshot" ADD CONSTRAINT "GrowthContentClusterSnapshot_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES "GrowthContentCluster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GrowthContentClusterMembership" ADD CONSTRAINT "GrowthContentClusterMembership_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "GrowthContentClusterSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GrowthContentClusterMembership" ADD CONSTRAINT "GrowthContentClusterMembership_pinId_fkey" FOREIGN KEY ("pinId") REFERENCES "GrowthPinterestPin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GrowthContentClusterMembership" ADD CONSTRAINT "GrowthContentClusterMembership_translatorId_fkey" FOREIGN KEY ("translatorId") REFERENCES "Translator"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GrowthOpportunity" ADD CONSTRAINT "GrowthOpportunity_analysisRunId_fkey" FOREIGN KEY ("analysisRunId") REFERENCES "GrowthOpportunityAnalysisRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GrowthOpportunity" ADD CONSTRAINT "GrowthOpportunity_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES "GrowthContentCluster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TYPE "GrowthPinSignalType" AS ENUM ('WINNER','RISING','FATIGUE');
CREATE TYPE "GrowthSignalStrength" AS ENUM ('STRONG','CAUTIOUS');
CREATE TABLE "GrowthPinSignal" (
 "id" TEXT NOT NULL, "analysisRunId" TEXT NOT NULL, "clusterId" TEXT, "pinId" TEXT, "pinterestPinId" TEXT NOT NULL,
 "type" "GrowthPinSignalType" NOT NULL, "strength" "GrowthSignalStrength" NOT NULL, "confidence" INTEGER NOT NULL,
 "evidenceQuality" "GrowthOpportunityEvidenceQuality" NOT NULL, "evidence" JSONB NOT NULL, "reasonCodes" TEXT[] NOT NULL,
 "dedupeKey" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "GrowthPinSignal_pkey" PRIMARY KEY ("id"), CONSTRAINT "GrowthPinSignal_confidence_check" CHECK ("confidence" BETWEEN 0 AND 100)
);
CREATE UNIQUE INDEX "GrowthPinSignal_dedupeKey_key" ON "GrowthPinSignal"("dedupeKey");
CREATE INDEX "GrowthPinSignal_type_confidence_createdAt_idx" ON "GrowthPinSignal"("type","confidence","createdAt");
CREATE INDEX "GrowthPinSignal_analysisRunId_type_idx" ON "GrowthPinSignal"("analysisRunId","type");
CREATE INDEX "GrowthPinSignal_pinId_idx" ON "GrowthPinSignal"("pinId");
ALTER TABLE "GrowthPinSignal" ADD CONSTRAINT "GrowthPinSignal_analysisRunId_fkey" FOREIGN KEY ("analysisRunId") REFERENCES "GrowthOpportunityAnalysisRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GrowthPinSignal" ADD CONSTRAINT "GrowthPinSignal_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES "GrowthContentCluster"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GrowthPinSignal" ADD CONSTRAINT "GrowthPinSignal_pinId_fkey" FOREIGN KEY ("pinId") REFERENCES "GrowthPinterestPin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
