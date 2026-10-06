-- Phase 5 adds first-party Pinterest attribution. Collection remains disabled by default.
ALTER TYPE "GrowthJobType" ADD VALUE 'ATTRIBUTION_RETENTION_CLEANUP';

CREATE TYPE "GrowthAttributionEventType" AS ENUM (
  'PINTEREST_LANDING',
  'TRANSLATOR_VIEW',
  'INPUT_STARTED',
  'TRANSLATION_COMPLETED',
  'IDEA_VIEW',
  'IDEA_CTA',
  'EMBEDDED_TRANSLATION_COMPLETED'
);

ALTER TABLE "GrowthSettings"
  ADD COLUMN "attributionEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "attributionWindowDays" INTEGER NOT NULL DEFAULT 7,
  ADD COLUMN "attributionSessionRetentionDays" INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN "attributionEventRetentionDays" INTEGER NOT NULL DEFAULT 90;

ALTER TABLE "GrowthSettings"
  ADD CONSTRAINT "GrowthSettings_attributionWindowDays_check" CHECK ("attributionWindowDays" BETWEEN 1 AND 30),
  ADD CONSTRAINT "GrowthSettings_attributionSessionRetentionDays_check" CHECK ("attributionSessionRetentionDays" BETWEEN 7 AND 90),
  ADD CONSTRAINT "GrowthSettings_attributionEventRetentionDays_check" CHECK ("attributionEventRetentionDays" BETWEEN 30 AND 365);

CREATE TABLE "GrowthAttributionRef" (
  "id" TEXT NOT NULL,
  "publicRef" TEXT NOT NULL,
  "pinId" TEXT,
  "destinationPath" TEXT NOT NULL,
  "campaignKey" TEXT NOT NULL,
  "contentKey" TEXT NOT NULL,
  "modelVersion" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GrowthAttributionRef_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GrowthAttributionSession" (
  "id" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "firstAttributionRefId" TEXT NOT NULL,
  "lastAttributionRefId" TEXT NOT NULL,
  "firstTouchAt" TIMESTAMP(3) NOT NULL,
  "lastTouchAt" TIMESTAMP(3) NOT NULL,
  "attributionExpiresAt" TIMESTAMP(3) NOT NULL,
  "modelVersion" TEXT NOT NULL,
  "qualifiedConversionAt" TIMESTAMP(3),
  "qualifiedAttributionRefId" TEXT,
  "qualifiedTranslationLogId" TEXT,
  "qualifiedTranslatorId" TEXT,
  "deleteAfter" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GrowthAttributionSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GrowthAttributionEvent" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT,
  "attributionRefId" TEXT NOT NULL,
  "type" "GrowthAttributionEventType" NOT NULL,
  "eventKey" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "translatorId" TEXT,
  "translationLogId" TEXT,
  "isPrimaryQualifiedConversion" BOOLEAN NOT NULL DEFAULT false,
  "modelVersion" TEXT NOT NULL,
  "retentionAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GrowthAttributionEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GrowthAttributionDailyAggregate" (
  "id" TEXT NOT NULL,
  "dimensionKey" TEXT NOT NULL,
  "metricDate" TIMESTAMP(3) NOT NULL,
  "attributionRefId" TEXT NOT NULL,
  "translatorId" TEXT,
  "modelVersion" TEXT NOT NULL,
  "landingSessions" INTEGER NOT NULL DEFAULT 0,
  "attributedTranslations" INTEGER NOT NULL DEFAULT 0,
  "qualifiedConversions" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GrowthAttributionDailyAggregate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GrowthAttributionRef_publicRef_key" ON "GrowthAttributionRef"("publicRef");
CREATE UNIQUE INDEX "GrowthAttributionRef_pinId_key" ON "GrowthAttributionRef"("pinId");
CREATE INDEX "GrowthAttributionRef_isActive_createdAt_idx" ON "GrowthAttributionRef"("isActive", "createdAt");
CREATE INDEX "GrowthAttributionRef_modelVersion_createdAt_idx" ON "GrowthAttributionRef"("modelVersion", "createdAt");

CREATE UNIQUE INDEX "GrowthAttributionSession_tokenHash_key" ON "GrowthAttributionSession"("tokenHash");
CREATE UNIQUE INDEX "GrowthAttributionSession_qualifiedTranslationLogId_key" ON "GrowthAttributionSession"("qualifiedTranslationLogId");
CREATE INDEX "GrowthAttributionSession_attributionExpiresAt_idx" ON "GrowthAttributionSession"("attributionExpiresAt");
CREATE INDEX "GrowthAttributionSession_deleteAfter_idx" ON "GrowthAttributionSession"("deleteAfter");
CREATE INDEX "GrowthAttributionSession_firstAttributionRefId_firstTouchAt_idx" ON "GrowthAttributionSession"("firstAttributionRefId", "firstTouchAt");
CREATE INDEX "GrowthAttributionSession_lastAttributionRefId_lastTouchAt_idx" ON "GrowthAttributionSession"("lastAttributionRefId", "lastTouchAt");
CREATE INDEX "GrowthAttributionSession_qualifiedAttributionRefId_qualifiedConversionAt_idx" ON "GrowthAttributionSession"("qualifiedAttributionRefId", "qualifiedConversionAt");

CREATE UNIQUE INDEX "GrowthAttributionEvent_eventKey_key" ON "GrowthAttributionEvent"("eventKey");
CREATE UNIQUE INDEX "GrowthAttributionEvent_translationLogId_key" ON "GrowthAttributionEvent"("translationLogId");
CREATE INDEX "GrowthAttributionEvent_type_occurredAt_idx" ON "GrowthAttributionEvent"("type", "occurredAt");
CREATE INDEX "GrowthAttributionEvent_attributionRefId_occurredAt_idx" ON "GrowthAttributionEvent"("attributionRefId", "occurredAt");
CREATE INDEX "GrowthAttributionEvent_translatorId_occurredAt_idx" ON "GrowthAttributionEvent"("translatorId", "occurredAt");
CREATE INDEX "GrowthAttributionEvent_sessionId_occurredAt_idx" ON "GrowthAttributionEvent"("sessionId", "occurredAt");
CREATE INDEX "GrowthAttributionEvent_retentionAt_idx" ON "GrowthAttributionEvent"("retentionAt");

CREATE UNIQUE INDEX "GrowthAttributionDailyAggregate_dimensionKey_key" ON "GrowthAttributionDailyAggregate"("dimensionKey");
CREATE INDEX "GrowthAttributionDailyAggregate_metricDate_idx" ON "GrowthAttributionDailyAggregate"("metricDate");
CREATE INDEX "GrowthAttributionDailyAggregate_attributionRefId_metricDate_idx" ON "GrowthAttributionDailyAggregate"("attributionRefId", "metricDate");
CREATE INDEX "GrowthAttributionDailyAggregate_translatorId_metricDate_idx" ON "GrowthAttributionDailyAggregate"("translatorId", "metricDate");
CREATE INDEX "GrowthAttributionDailyAggregate_modelVersion_metricDate_idx" ON "GrowthAttributionDailyAggregate"("modelVersion", "metricDate");

ALTER TABLE "GrowthAttributionRef" ADD CONSTRAINT "GrowthAttributionRef_pinId_fkey" FOREIGN KEY ("pinId") REFERENCES "GrowthPinterestPin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GrowthAttributionSession" ADD CONSTRAINT "GrowthAttributionSession_firstAttributionRefId_fkey" FOREIGN KEY ("firstAttributionRefId") REFERENCES "GrowthAttributionRef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GrowthAttributionSession" ADD CONSTRAINT "GrowthAttributionSession_lastAttributionRefId_fkey" FOREIGN KEY ("lastAttributionRefId") REFERENCES "GrowthAttributionRef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GrowthAttributionSession" ADD CONSTRAINT "GrowthAttributionSession_qualifiedAttributionRefId_fkey" FOREIGN KEY ("qualifiedAttributionRefId") REFERENCES "GrowthAttributionRef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GrowthAttributionSession" ADD CONSTRAINT "GrowthAttributionSession_qualifiedTranslationLogId_fkey" FOREIGN KEY ("qualifiedTranslationLogId") REFERENCES "TranslationLog"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GrowthAttributionSession" ADD CONSTRAINT "GrowthAttributionSession_qualifiedTranslatorId_fkey" FOREIGN KEY ("qualifiedTranslatorId") REFERENCES "Translator"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GrowthAttributionEvent" ADD CONSTRAINT "GrowthAttributionEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "GrowthAttributionSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GrowthAttributionEvent" ADD CONSTRAINT "GrowthAttributionEvent_attributionRefId_fkey" FOREIGN KEY ("attributionRefId") REFERENCES "GrowthAttributionRef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GrowthAttributionEvent" ADD CONSTRAINT "GrowthAttributionEvent_translatorId_fkey" FOREIGN KEY ("translatorId") REFERENCES "Translator"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GrowthAttributionEvent" ADD CONSTRAINT "GrowthAttributionEvent_translationLogId_fkey" FOREIGN KEY ("translationLogId") REFERENCES "TranslationLog"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GrowthAttributionDailyAggregate" ADD CONSTRAINT "GrowthAttributionDailyAggregate_attributionRefId_fkey" FOREIGN KEY ("attributionRefId") REFERENCES "GrowthAttributionRef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GrowthAttributionDailyAggregate" ADD CONSTRAINT "GrowthAttributionDailyAggregate_translatorId_fkey" FOREIGN KEY ("translatorId") REFERENCES "Translator"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GrowthAttributionRef" ADD CONSTRAINT "GrowthAttributionRef_publicRef_length_check" CHECK (char_length("publicRef") BETWEEN 24 AND 96);
ALTER TABLE "GrowthAttributionSession" ADD CONSTRAINT "GrowthAttributionSession_tokenHash_length_check" CHECK (char_length("tokenHash") = 64);
ALTER TABLE "GrowthAttributionDailyAggregate" ADD CONSTRAINT "GrowthAttributionDailyAggregate_counts_check" CHECK ("landingSessions" >= 0 AND "attributedTranslations" >= 0 AND "qualifiedConversions" >= 0);
