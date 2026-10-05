-- Phase 4 adds only Pinterest Pin inventory, organic daily metrics, and resumable sync state.
ALTER TYPE "GrowthJobType" ADD VALUE 'PINTEREST_PIN_INVENTORY_SYNC';
ALTER TYPE "GrowthJobType" ADD VALUE 'PINTEREST_ACCOUNT_ANALYTICS_SYNC';
ALTER TYPE "GrowthJobType" ADD VALUE 'PINTEREST_PIN_ANALYTICS_SYNC';

CREATE TYPE "GrowthPinterestAnalyticsStatus" AS ENUM ('NEVER_SYNCED', 'BACKFILLING', 'FRESH', 'STALE', 'PARTIAL', 'FAILED');

CREATE TABLE "GrowthPinterestPin" (
    "id" TEXT NOT NULL,
    "pinterestPinId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "boardId" TEXT,
    "pinterestBoardId" TEXT,
    "title" TEXT,
    "description" TEXT,
    "destinationUrl" TEXT,
    "creativeType" TEXT,
    "mediaType" TEXT,
    "previewImageUrl" TEXT,
    "publishedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL,
    "lastAnalyticsSyncAt" TIMESTAMP(3),
    "analyticsPriorityAt" TIMESTAMP(3),
    "summaryStartDate" TIMESTAMP(3),
    "summaryEndDate" TIMESTAMP(3),
    "summaryFetchedAt" TIMESTAMP(3),
    "summaryImpressions" BIGINT,
    "summarySaves" BIGINT,
    "summaryPinClicks" BIGINT,
    "summaryOutboundClicks" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GrowthPinterestPin_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GrowthPinterestAccountMetricDaily" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "metricDate" TIMESTAMP(3) NOT NULL,
    "impressions" BIGINT NOT NULL DEFAULT 0,
    "saves" BIGINT NOT NULL DEFAULT 0,
    "pinClicks" BIGINT NOT NULL DEFAULT 0,
    "outboundClicks" BIGINT NOT NULL DEFAULT 0,
    "engagements" BIGINT NOT NULL DEFAULT 0,
    "dataStatus" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GrowthPinterestAccountMetricDaily_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GrowthPinterestPinMetricDaily" (
    "id" TEXT NOT NULL,
    "pinId" TEXT NOT NULL,
    "metricDate" TIMESTAMP(3) NOT NULL,
    "impressions" BIGINT NOT NULL DEFAULT 0,
    "saves" BIGINT NOT NULL DEFAULT 0,
    "pinClicks" BIGINT NOT NULL DEFAULT 0,
    "outboundClicks" BIGINT NOT NULL DEFAULT 0,
    "dataStatus" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GrowthPinterestPinMetricDaily_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GrowthPinterestAnalyticsState" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "status" "GrowthPinterestAnalyticsStatus" NOT NULL DEFAULT 'NEVER_SYNCED',
    "inventoryBookmark" TEXT,
    "inventoryStartedAt" TIMESTAMP(3),
    "inventoryPageCount" INTEGER NOT NULL DEFAULT 0,
    "inventoryPinCount" INTEGER NOT NULL DEFAULT 0,
    "inventorySeenBookmarks" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "backfillStartDate" TIMESTAMP(3),
    "backfillEndDate" TIMESTAMP(3),
    "backfillStartedAt" TIMESTAMP(3),
    "backfillCompletedAt" TIMESTAMP(3),
    "backfillPinsTotal" INTEGER NOT NULL DEFAULT 0,
    "backfillPinsProcessed" INTEGER NOT NULL DEFAULT 0,
    "lastInventorySyncAt" TIMESTAMP(3),
    "lastAccountAnalyticsSyncAt" TIMESTAMP(3),
    "lastPinAnalyticsSyncAt" TIMESTAMP(3),
    "lastSuccessfulSyncAt" TIMESTAMP(3),
    "lastAttemptAt" TIMESTAMP(3),
    "lastError" TEXT,
    "lastRateLimitLimit" TEXT,
    "lastRateLimitRemaining" TEXT,
    "lastRateLimitReset" TEXT,
    "rateLimitObservedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GrowthPinterestAnalyticsState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GrowthPinterestPin_pinterestPinId_key" ON "GrowthPinterestPin"("pinterestPinId");
CREATE INDEX "GrowthPinterestPin_accountId_isActive_idx" ON "GrowthPinterestPin"("accountId", "isActive");
CREATE INDEX "GrowthPinterestPin_accountId_lastAnalyticsSyncAt_idx" ON "GrowthPinterestPin"("accountId", "lastAnalyticsSyncAt");
CREATE INDEX "GrowthPinterestPin_accountId_analyticsPriorityAt_idx" ON "GrowthPinterestPin"("accountId", "analyticsPriorityAt");
CREATE INDEX "GrowthPinterestPin_pinterestBoardId_idx" ON "GrowthPinterestPin"("pinterestBoardId");

CREATE UNIQUE INDEX "GrowthPinterestAccountMetricDaily_accountId_metricDate_key" ON "GrowthPinterestAccountMetricDaily"("accountId", "metricDate");
CREATE INDEX "GrowthPinterestAccountMetricDaily_metricDate_idx" ON "GrowthPinterestAccountMetricDaily"("metricDate");
CREATE INDEX "GrowthPinterestAccountMetricDaily_accountId_outboundClicks_idx" ON "GrowthPinterestAccountMetricDaily"("accountId", "outboundClicks");

CREATE UNIQUE INDEX "GrowthPinterestPinMetricDaily_pinId_metricDate_key" ON "GrowthPinterestPinMetricDaily"("pinId", "metricDate");
CREATE INDEX "GrowthPinterestPinMetricDaily_metricDate_idx" ON "GrowthPinterestPinMetricDaily"("metricDate");
CREATE INDEX "GrowthPinterestPinMetricDaily_pinId_outboundClicks_idx" ON "GrowthPinterestPinMetricDaily"("pinId", "outboundClicks");
CREATE INDEX "GrowthPinterestPinMetricDaily_outboundClicks_metricDate_idx" ON "GrowthPinterestPinMetricDaily"("outboundClicks", "metricDate");

CREATE UNIQUE INDEX "GrowthPinterestAnalyticsState_accountId_key" ON "GrowthPinterestAnalyticsState"("accountId");
CREATE INDEX "GrowthPinterestAnalyticsState_status_lastSuccessfulSyncAt_idx" ON "GrowthPinterestAnalyticsState"("status", "lastSuccessfulSyncAt");

ALTER TABLE "GrowthPinterestPin" ADD CONSTRAINT "GrowthPinterestPin_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "GrowthPinterestAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GrowthPinterestPin" ADD CONSTRAINT "GrowthPinterestPin_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "GrowthPinterestBoard"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GrowthPinterestAccountMetricDaily" ADD CONSTRAINT "GrowthPinterestAccountMetricDaily_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "GrowthPinterestAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GrowthPinterestPinMetricDaily" ADD CONSTRAINT "GrowthPinterestPinMetricDaily_pinId_fkey" FOREIGN KEY ("pinId") REFERENCES "GrowthPinterestPin"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GrowthPinterestAnalyticsState" ADD CONSTRAINT "GrowthPinterestAnalyticsState_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "GrowthPinterestAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GrowthPinterestAnalyticsState" ADD CONSTRAINT "GrowthPinterestAnalyticsState_inventoryPageCount_check" CHECK ("inventoryPageCount" >= 0 AND "inventoryPageCount" <= 10);
ALTER TABLE "GrowthPinterestAnalyticsState" ADD CONSTRAINT "GrowthPinterestAnalyticsState_inventoryPinCount_check" CHECK ("inventoryPinCount" >= 0 AND "inventoryPinCount" <= 2500);
ALTER TABLE "GrowthPinterestAnalyticsState" ADD CONSTRAINT "GrowthPinterestAnalyticsState_backfill_progress_check" CHECK ("backfillPinsTotal" >= 0 AND "backfillPinsProcessed" >= 0 AND "backfillPinsProcessed" <= "backfillPinsTotal");
