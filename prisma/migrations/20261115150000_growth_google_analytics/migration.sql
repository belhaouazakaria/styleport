-- CreateTable
CREATE TABLE "GrowthExternalAnalyticsDaily" (
    "id" TEXT NOT NULL,
    "source" VARCHAR(24) NOT NULL,
    "accountId" TEXT NOT NULL,
    "metricDate" TIMESTAMP(3) NOT NULL,
    "providerTimeZone" VARCHAR(80) NOT NULL,
    "metrics" JSONB NOT NULL,
    "qualityFlags" TEXT[],
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GrowthExternalAnalyticsDaily_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GrowthExternalAnalyticsDaily_source_metricDate_idx" ON "GrowthExternalAnalyticsDaily"("source", "metricDate");

-- CreateIndex
CREATE UNIQUE INDEX "GrowthExternalAnalyticsDaily_source_accountId_metricDate_key" ON "GrowthExternalAnalyticsDaily"("source", "accountId", "metricDate");

ALTER TABLE "GrowthExternalAnalyticsDaily" ADD CONSTRAINT "external_analytics_source" CHECK ("source" IN ('GA4','SEARCH_CONSOLE')),
 ADD CONSTRAINT "external_analytics_metrics" CHECK (jsonb_typeof("metrics") = 'object' AND pg_column_size("metrics") < 8192);
