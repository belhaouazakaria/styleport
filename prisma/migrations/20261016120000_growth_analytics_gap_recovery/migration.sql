ALTER TYPE "GrowthJobType" ADD VALUE 'PINTEREST_ANALYTICS_GAP_RECOVERY';

ALTER TABLE "GrowthPinterestPinMetricDaily"
  ALTER COLUMN "impressions" DROP DEFAULT,
  ALTER COLUMN "impressions" DROP NOT NULL,
  ALTER COLUMN "saves" DROP DEFAULT,
  ALTER COLUMN "saves" DROP NOT NULL,
  ALTER COLUMN "pinClicks" DROP DEFAULT,
  ALTER COLUMN "pinClicks" DROP NOT NULL,
  ALTER COLUMN "outboundClicks" DROP DEFAULT,
  ALTER COLUMN "outboundClicks" DROP NOT NULL;

CREATE TYPE "GrowthPinterestAnalyticsRecoveryStatus" AS ENUM (
  'QUEUED',
  'RUNNING',
  'COMPLETED',
  'COMPLETED_WITH_GAPS',
  'FAILED'
);

CREATE TYPE "GrowthPinterestAnalyticsRecoveryTaskStatus" AS ENUM (
  'PENDING',
  'COMPLETED'
);

CREATE TABLE "GrowthPinterestAnalyticsRecovery" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "requestedByUserId" TEXT NOT NULL,
  "startDate" TIMESTAMP(3) NOT NULL,
  "endDate" TIMESTAMP(3) NOT NULL,
  "previewToken" TEXT NOT NULL,
  "status" "GrowthPinterestAnalyticsRecoveryStatus" NOT NULL DEFAULT 'QUEUED',
  "affectedPinCount" INTEGER NOT NULL,
  "missingObservationCount" INTEGER NOT NULL,
  "processingObservationCount" INTEGER NOT NULL,
  "estimatedRequestCount" INTEGER NOT NULL,
  "requestBudget" INTEGER NOT NULL DEFAULT 8,
  "requestsCompleted" INTEGER NOT NULL DEFAULT 0,
  "jobId" TEXT,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "GrowthPinterestAnalyticsRecovery_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GrowthPinterestAnalyticsRecovery_requestBudget_check" CHECK ("requestBudget" BETWEEN 1 AND 8),
  CONSTRAINT "GrowthPinterestAnalyticsRecovery_date_order_check" CHECK ("startDate" <= "endDate")
);

CREATE TABLE "GrowthPinterestAnalyticsRecoveryTask" (
  "id" TEXT NOT NULL,
  "recoveryId" TEXT NOT NULL,
  "pinId" TEXT,
  "pinterestPinId" TEXT NOT NULL,
  "startDate" TIMESTAMP(3) NOT NULL,
  "endDate" TIMESTAMP(3) NOT NULL,
  "missingDates" TEXT[] NOT NULL,
  "processingDates" TEXT[] NOT NULL,
  "status" "GrowthPinterestAnalyticsRecoveryTaskStatus" NOT NULL DEFAULT 'PENDING',
  "responseRowCount" INTEGER,
  "unresolvedDateCount" INTEGER,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "GrowthPinterestAnalyticsRecoveryTask_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GrowthPinterestAnalyticsRecoveryTask_date_order_check" CHECK ("startDate" <= "endDate")
);

CREATE INDEX "GrowthPinterestAnalyticsRecovery_status_createdAt_idx"
  ON "GrowthPinterestAnalyticsRecovery"("status", "createdAt");
CREATE INDEX "GrowthPinterestAnalyticsRecovery_accountId_createdAt_idx"
  ON "GrowthPinterestAnalyticsRecovery"("accountId", "createdAt");
CREATE UNIQUE INDEX "GrowthPinterestAnalyticsRecoveryTask_recoveryId_pinterestPinId_startDate_endDate_key"
  ON "GrowthPinterestAnalyticsRecoveryTask"("recoveryId", "pinterestPinId", "startDate", "endDate");
CREATE INDEX "GrowthPinterestAnalyticsRecoveryTask_recoveryId_status_pinterestPinId_startDate_idx"
  ON "GrowthPinterestAnalyticsRecoveryTask"("recoveryId", "status", "pinterestPinId", "startDate");
CREATE INDEX "GrowthPinterestAnalyticsRecoveryTask_pinId_idx"
  ON "GrowthPinterestAnalyticsRecoveryTask"("pinId");

ALTER TABLE "GrowthPinterestAnalyticsRecovery"
  ADD CONSTRAINT "GrowthPinterestAnalyticsRecovery_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "GrowthPinterestAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "GrowthPinterestAnalyticsRecoveryTask"
  ADD CONSTRAINT "GrowthPinterestAnalyticsRecoveryTask_recoveryId_fkey"
  FOREIGN KEY ("recoveryId") REFERENCES "GrowthPinterestAnalyticsRecovery"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GrowthPinterestAnalyticsRecoveryTask"
  ADD CONSTRAINT "GrowthPinterestAnalyticsRecoveryTask_pinId_fkey"
  FOREIGN KEY ("pinId") REFERENCES "GrowthPinterestPin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
