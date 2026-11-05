-- Phase 14K owner-configurable daily growth cadence.
-- Configuration only. No Growth worker or publisher reads this table yet.
-- PostgreSQL checks prevent unsupported modes/limits even if bypassing API.
CREATE TABLE "GrowthDailyCadencePreference" (
  "id" TEXT NOT NULL DEFAULT 'global',
  "pinMode" VARCHAR(10) NOT NULL DEFAULT 'AUTO',
  "pinMinimum" INTEGER NOT NULL DEFAULT 1,
  "pinMaximum" INTEGER NOT NULL DEFAULT 10,
  "pinFixed" INTEGER,
  "translatorMode" VARCHAR(10) NOT NULL DEFAULT 'AUTO',
  "translatorMinimum" INTEGER NOT NULL DEFAULT 1,
  "translatorMaximum" INTEGER NOT NULL DEFAULT 10,
  "translatorFixed" INTEGER,
  "configVersion" INTEGER NOT NULL DEFAULT 1,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GrowthDailyCadencePreference_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GrowthDailyCadencePreference_pin_policy_check" CHECK (
    "pinMode" IN ('AUTO','FIXED','PAUSED')
    AND "pinMinimum" BETWEEN 1 AND 10
    AND "pinMaximum" BETWEEN 1 AND 10
    AND "pinMinimum" <= "pinMaximum"
    AND (
      ("pinMode" = 'FIXED' AND "pinFixed" IS NOT NULL AND "pinFixed" BETWEEN "pinMinimum" AND "pinMaximum")
      OR ("pinMode" <> 'FIXED' AND "pinFixed" IS NULL)
    )
  ),
  CONSTRAINT "GrowthDailyCadencePreference_translator_policy_check" CHECK (
    "translatorMode" IN ('AUTO','FIXED','PAUSED')
    AND "translatorMinimum" BETWEEN 1 AND 10
    AND "translatorMaximum" BETWEEN 1 AND 10
    AND "translatorMinimum" <= "translatorMaximum"
    AND (
      ("translatorMode" = 'FIXED' AND "translatorFixed" IS NOT NULL AND "translatorFixed" BETWEEN
        "translatorMinimum" AND "translatorMaximum")
      OR ("translatorMode" <> 'FIXED' AND "translatorFixed" IS NULL)
    )
  )
);

CREATE INDEX "GrowthDailyCadencePreference_updatedAt_idx"
  ON "GrowthDailyCadencePreference"("updatedAt");

ALTER TABLE "GrowthDailyCadencePreference"
  ADD CONSTRAINT "GrowthDailyCadencePreference_updatedById_fkey"
  FOREIGN KEY ("updatedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "GrowthDailyCadencePreference"
  ("id","pinMode","pinMinimum","pinMaximum","pinFixed",
   "translatorMode","translatorMinimum","translatorMaximum",
   "translatorFixed","configVersion","updatedAt")
VALUES
  ('global','AUTO',1,10,NULL,'AUTO',1,10,NULL,1,CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
