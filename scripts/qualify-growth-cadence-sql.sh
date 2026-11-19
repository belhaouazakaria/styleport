#!/usr/bin/env bash
set -Eeuo pipefail
# Run only against the explicitly named isolated disposable PostgreSQL database.
EXPECTED="postgresql://growthcadence:dev-only@127.0.0.1:5432/saytwist_growth_phase14k_cadence_test"
if [[ "${DATABASE_URL:-}" != "$EXPECTED" ]]; then
  echo "GROWTH_CADENCE_SQL_TEST=BLOCKED_WRONG_DATABASE" >&2
  exit 1
fi
command -v psql >/dev/null || { echo "PSQL_MISSING" >&2; exit 1; }
MIGRATION="prisma/migrations/20261105150000_growth_daily_cadence_controls/migration.sql"
[[ -f "$MIGRATION" ]] || exit 1

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL'
CREATE TABLE "User" ("id" TEXT PRIMARY KEY);
INSERT INTO "User" ("id") VALUES ('test-admin');
CREATE TABLE "GrowthSettings" (
  "id" TEXT PRIMARY KEY,
  "aiImagesPerDayCap" INTEGER NOT NULL DEFAULT 3
);
INSERT INTO "GrowthSettings" ("id", "aiImagesPerDayCap") VALUES
  ('global', 3), ('custom', 4);
SQL

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -f "$MIGRATION"
PLAN_MIGRATION="prisma/migrations/20261119090000_growth_daily_plan_targets/migration.sql"
[[ -f "$PLAN_MIGRATION" ]] || exit 1
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -f "$PLAN_MIGRATION"

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL'
DO $check$
DECLARE row_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO row_count FROM "GrowthDailyCadencePreference"
  WHERE "id" = 'global'
    AND "pinMode" = 'AUTO' AND "pinMinimum" = 1
    AND "pinMaximum" = 10 AND "pinFixed" IS NULL
    AND "translatorMode" = 'AUTO' AND "translatorMinimum" = 1
    AND "translatorMaximum" = 10 AND "translatorFixed" IS NULL;
  IF row_count <> 1 THEN RAISE EXCEPTION 'INVALID_DEFAULT_CADENCE'; END IF;
  SELECT COUNT(*) INTO row_count FROM "GrowthDailyCadencePreference"
  WHERE "id" = 'global' AND "newTranslatorPins" = 1
    AND "existingTranslatorPins" = 2 AND "anythingTranslatePins" = 2;
  IF row_count <> 1 THEN RAISE EXCEPTION 'INVALID_DEFAULT_DAILY_PLAN'; END IF;
  IF (SELECT "aiImagesPerDayCap" FROM "GrowthSettings" WHERE "id"='global') <> 5
     OR (SELECT "aiImagesPerDayCap" FROM "GrowthSettings" WHERE "id"='custom') <> 4 THEN
    RAISE EXCEPTION 'INVALID_IMAGE_CAP_MIGRATION';
  END IF;
END $check$;

CREATE FUNCTION pg_temp.must_reject_check(sqltext TEXT)
RETURNS VOID LANGUAGE plpgsql AS $check$
BEGIN
  BEGIN
    EXECUTE sqltext;
  EXCEPTION WHEN check_violation THEN
    RETURN;
  END;
  RAISE EXCEPTION 'CHECK_FAILED_TO_REJECT';
END $check$;

SELECT pg_temp.must_reject_check(
  'UPDATE "GrowthDailyCadencePreference" SET "pinMode"=''FIXED'', "pinFixed"=NULL'
);
SELECT pg_temp.must_reject_check(
  'UPDATE "GrowthDailyCadencePreference" SET "pinMode"=''UNKNOWN'''
);
SELECT pg_temp.must_reject_check(
  'UPDATE "GrowthDailyCadencePreference" SET "pinMinimum"=0'
);
SELECT pg_temp.must_reject_check(
  'UPDATE "GrowthDailyCadencePreference" SET "pinMaximum"=11'
);
SELECT pg_temp.must_reject_check(
  'UPDATE "GrowthDailyCadencePreference" SET "pinMinimum"=9, "pinMaximum"=4'
);
SELECT pg_temp.must_reject_check(
  'UPDATE "GrowthDailyCadencePreference" SET "pinFixed"=2'
);
SELECT pg_temp.must_reject_check(
  'UPDATE "GrowthDailyCadencePreference" SET "translatorMode"=''FIXED'', "translatorFixed"=NULL'
);
SELECT pg_temp.must_reject_check(
  'UPDATE "GrowthDailyCadencePreference" SET "translatorMode"=''INVALID'''
);
SELECT pg_temp.must_reject_check(
  'UPDATE "GrowthDailyCadencePreference" SET "translatorMaximum"=11'
);
SELECT pg_temp.must_reject_check(
  'UPDATE "GrowthDailyCadencePreference" SET "translatorMinimum"=10, "translatorMaximum"=2'
);
SELECT pg_temp.must_reject_check(
  'UPDATE "GrowthDailyCadencePreference" SET "translatorFixed"=5'
);
SELECT pg_temp.must_reject_check(
  'UPDATE "GrowthDailyCadencePreference" SET "newTranslatorPins"=6'
);
SELECT pg_temp.must_reject_check(
  'UPDATE "GrowthDailyCadencePreference" SET "newTranslatorPins"=5, "existingTranslatorPins"=5, "anythingTranslatePins"=1'
);

UPDATE "GrowthDailyCadencePreference"
SET "pinMode" = 'FIXED', "pinFixed" = 7,
    "translatorMode" = 'PAUSED', "translatorFixed" = NULL,
    "updatedById" = 'test-admin';
DO $check$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "GrowthDailyCadencePreference"
    WHERE "pinMode" = 'FIXED' AND "pinFixed" = 7
      AND "translatorMode" = 'PAUSED' AND "translatorFixed" IS NULL
      AND "updatedById" = 'test-admin'
  ) THEN RAISE EXCEPTION 'VALID_CADENCE_UPDATE_FAILED'; END IF;
END $check$;
SQL

echo "GROWTH_CADENCE_SQL_TEST=PASSED"
