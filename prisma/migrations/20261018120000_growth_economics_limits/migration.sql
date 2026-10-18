-- Phase 13 budget configuration. No spending is permitted on the strength of
-- these fields alone: monetary reservations and provider accounting are separate.
ALTER TABLE "GrowthSettings"
  ADD COLUMN "aiDailyBudgetCents" INTEGER NOT NULL DEFAULT 200,
  ADD COLUMN "aiMonthlyBudgetCents" INTEGER NOT NULL DEFAULT 3000,
  ADD COLUMN "aiImagesPerDayCap" INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN "translatorCreatesPerDayCap" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "translatorUpdatesPerDayCap" INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN "ideaCreatesPerWeekCap" INTEGER NOT NULL DEFAULT 2;

-- Reserve a conservative upper bound before any Growth paid provider call.
-- Reserved amounts remain counted even if provider reconciliation is absent.
CREATE TYPE "GrowthAiOperationKind" AS ENUM ('TEXT', 'IMAGE');
CREATE TYPE "GrowthAiReservationStatus" AS ENUM ('RESERVED', 'RECONCILED');

CREATE TABLE "GrowthAiBudgetReservation" (
  "id" TEXT NOT NULL,
  "requestKey" VARCHAR(191) NOT NULL,
  "jobId" VARCHAR(191),
  "kind" "GrowthAiOperationKind" NOT NULL,
  "status" "GrowthAiReservationStatus" NOT NULL DEFAULT 'RESERVED',
  "provider" VARCHAR(80) NOT NULL,
  "model" VARCHAR(120) NOT NULL,
  "pricingVersion" VARCHAR(120) NOT NULL,
  "reservedCents" INTEGER NOT NULL,
  "reconciledCents" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reconciledAt" TIMESTAMP(3),
  CONSTRAINT "GrowthAiBudgetReservation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GrowthAiBudgetReservation_reservedCents_check" CHECK ("reservedCents" > 0),
  CONSTRAINT "GrowthAiBudgetReservation_reconciledCents_check" CHECK ("reconciledCents" IS NULL OR ("reconciledCents" >= 0 AND "reconciledCents" <= "reservedCents"))
);
CREATE UNIQUE INDEX "GrowthAiBudgetReservation_requestKey_key" ON "GrowthAiBudgetReservation"("requestKey");
CREATE INDEX "GrowthAiBudgetReservation_createdAt_kind_idx" ON "GrowthAiBudgetReservation"("createdAt", "kind");
CREATE INDEX "GrowthAiBudgetReservation_jobId_createdAt_idx" ON "GrowthAiBudgetReservation"("jobId", "createdAt");

-- Phase 13 reporting. One immutable digest per UTC report date and one
-- delivery state per report. SENDING is sticky across worker crashes.
CREATE TYPE "GrowthReportDeliveryStatus" AS ENUM ('READY','SENDING','SUBMITTED','OUTCOME_UNKNOWN');

CREATE TABLE "GrowthDailyReport" (
  "id" TEXT NOT NULL,
  "reportDate" DATE NOT NULL,
  "version" VARCHAR(80) NOT NULL,
  "snapshot" JSONB NOT NULL,
  "digestText" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GrowthDailyReport_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GrowthDailyReport_reportDate_key" ON "GrowthDailyReport"("reportDate");
CREATE INDEX "GrowthDailyReport_createdAt_idx" ON "GrowthDailyReport"("createdAt");

CREATE TABLE "GrowthReportDelivery" (
  "id" TEXT NOT NULL,
  "reportId" TEXT NOT NULL,
  "status" "GrowthReportDeliveryStatus" NOT NULL DEFAULT 'READY',
  "channel" VARCHAR(24) NOT NULL DEFAULT 'OPENWA',
  "recipientHash" VARCHAR(64),
  "providerMessageId" VARCHAR(512),
  "attemptedAt" TIMESTAMP(3),
  "submittedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GrowthReportDelivery_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GrowthReportDelivery_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "GrowthDailyReport"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "GrowthReportDelivery_reportId_key" ON "GrowthReportDelivery"("reportId");
CREATE INDEX "GrowthReportDelivery_status_updatedAt_idx" ON "GrowthReportDelivery"("status", "updatedAt");
