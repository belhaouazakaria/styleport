ALTER TABLE "GrowthDailyCadencePreference"
  ADD COLUMN "newTranslatorPins" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "existingTranslatorPins" INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN "anythingTranslatePins" INTEGER NOT NULL DEFAULT 2;

ALTER TABLE "GrowthDailyCadencePreference"
  ADD CONSTRAINT "GrowthDailyCadencePreference_daily_plan_check"
  CHECK (
    "newTranslatorPins" BETWEEN 0 AND 5 AND
    "existingTranslatorPins" BETWEEN 0 AND 5 AND
    "anythingTranslatePins" BETWEEN 0 AND 5 AND
    "newTranslatorPins" + "existingTranslatorPins" + "anythingTranslatePins" <= 10
  );

-- Permit the five configured daily creative slots. The independent dollar
-- reservations remain the controlling spend cap. Preserve custom limits.
ALTER TABLE "GrowthSettings" ALTER COLUMN "aiImagesPerDayCap" SET DEFAULT 5;
UPDATE "GrowthSettings" SET "aiImagesPerDayCap" = 5
WHERE id = 'global' AND "aiImagesPerDayCap" = 3;
