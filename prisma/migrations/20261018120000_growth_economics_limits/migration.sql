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
