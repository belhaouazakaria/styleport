-- Phase 13 budget configuration. No spending is permitted on the strength of
-- these fields alone: monetary reservations and provider accounting are separate.
ALTER TABLE "GrowthSettings"
  ADD COLUMN "aiDailyBudgetCents" INTEGER NOT NULL DEFAULT 200,
  ADD COLUMN "aiMonthlyBudgetCents" INTEGER NOT NULL DEFAULT 3000,
  ADD COLUMN "aiImagesPerDayCap" INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN "translatorCreatesPerDayCap" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "translatorUpdatesPerDayCap" INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN "ideaCreatesPerWeekCap" INTEGER NOT NULL DEFAULT 2;
