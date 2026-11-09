#!/usr/bin/env bash
set -Eeuo pipefail
# Disposable PostgreSQL 18 rehearsal only. NEVER run with production credentials.
node <<'NODE'
const url = new URL(process.env.DATABASE_URL || "");
if (!["postgres:","postgresql:"].includes(url.protocol) ||
    url.hostname !== "127.0.0.1" || url.port !== "5432" ||
    url.pathname !== "/saytwist_growth_viral_ci_test" ||
    url.username !== "viralci" ||
    url.searchParams.has("host")) {
  throw Error("VIRAL_CI_DATABASE_TARGET_BLOCKED");
}
NODE
command -v psql >/dev/null || { echo "VIRAL_CI_PSQL_MISSING" >&2; exit 1; }
tmp=$(mktemp -d)
trap 'rm -rf -- "$tmp"' EXIT
cp prisma/schema.prisma "$tmp/schema.prisma"
cp -a prisma/migrations "$tmp/migrations"
migration=20261109190000_growth_viral_pin_approval
[[ -f "$tmp/migrations/$migration/migration.sql" ]] || exit 1
mv "$tmp/migrations/$migration" "$tmp/pending"
echo "VIRAL_CI_BASELINE_MIGRATIONS=START"
node node_modules/prisma/build/index.js migrate deploy --schema "$tmp/schema.prisma"

# Existing data is deliberately present BEFORE applying the reviewed migration.
psql -X -q -v ON_ERROR_STOP=1 "$DATABASE_URL" <<'SQL'
INSERT INTO "GrowthViralConcept"
  ("id","title","normalizedKey","sourceUrl")
VALUES
  ('ci-viral-concept','Royal English Translator','royal-english-translator',
   'https://anythingtranslate.com/translators/royal-english-translator/');

INSERT INTO "GrowthViralPinTest"
  ("id","conceptId","channel","destinationUrl","status","pinterestPinId","publishedAt")
VALUES
  ('ci-existing-pin','ci-viral-concept','SOURCE',
   'https://anythingtranslate.com/translators/royal-english-translator/',
   'TRACKED','1019995015645788765',CURRENT_TIMESTAMP);

INSERT INTO "GrowthViralPinTest"
  ("id","conceptId","channel","destinationUrl","status")
VALUES
  ('ci-new-source-draft','ci-viral-concept','SOURCE',
   'https://anythingtranslate.com/translators/royal-english-translator/','PLANNED');
SQL

mv "$tmp/pending" "$tmp/migrations/$migration"
echo "VIRAL_CI_UPGRADE=START"
node node_modules/prisma/build/index.js migrate deploy --schema "$tmp/schema.prisma"
psql -X -q -v ON_ERROR_STOP=1 "$DATABASE_URL" <<'SQL'
DO $$
BEGIN
  IF (SELECT count(*) FROM "_prisma_migrations"
      WHERE "migration_name" = '20261109190000_growth_viral_pin_approval'
        AND "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL) <> 1
  THEN
    RAISE EXCEPTION 'Prisma viral source migration not applied exactly once';
  END IF;
  IF (SELECT "status" FROM "GrowthViralPinTest" WHERE id='ci-existing-pin') <> 'TRACKED'
     OR (SELECT "pinterestPinId" FROM "GrowthViralPinTest" WHERE id='ci-existing-pin')
        <> '1019995015645788765'
     OR (SELECT "mode" FROM "GrowthViralProgramSettings" WHERE id='global') <> 'PAUSED'
  THEN
    RAISE EXCEPTION 'Existing Pin/settings changed unexpectedly';
  END IF;
END $$;

UPDATE "GrowthViralPinTest"
SET "status"='APPROVED',
    "assetChecksum"=repeat('a',64),
    "assetPublicPath"='/generated/growth-creatives/ci-test.png',
    "title"='Explore Royal English Wording',
    "description"='Independent topic spotlight linking to AnythingTranslate.',
    "rightsVerified"=true,
    "accountId"='ci-account',
    "boardId"='ci-board',
    "scheduledAt"=CURRENT_TIMESTAMP+interval '1 day',
    "approvedAt"=CURRENT_TIMESTAMP,
    "approvedById"='ci-admin',
    "publicationAttemptKey"='ci-approved-once'
WHERE id='ci-new-source-draft';

DO $$
DECLARE blocked boolean;
BEGIN
  blocked:=false;
  BEGIN
    UPDATE "GrowthViralPinTest" SET "title"='Mutated'
      WHERE id='ci-new-source-draft';
  EXCEPTION WHEN raise_exception THEN blocked:=true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'Approved snapshot was mutable'; END IF;

  blocked:=false;
  BEGIN
    UPDATE "GrowthViralPinTest"
      SET "destinationUrl"='https://saytwist.com/translators/royal-english/'
      WHERE id='ci-existing-pin';
  EXCEPTION WHEN raise_exception THEN blocked:=true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'Existing Pin destination was mutable'; END IF;

  blocked:=false;
  BEGIN
    UPDATE "GrowthViralPinTest"
      SET "status"='PUBLISHING' WHERE id='ci-new-source-draft';
  EXCEPTION WHEN check_violation THEN blocked:=true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'Unclaimed Pin was publishable'; END IF;

  blocked:=false;
  BEGIN
    INSERT INTO "GrowthViralPinTest"
      ("id","conceptId","channel","destinationUrl","status")
    VALUES
      ('ci-duplicate','ci-viral-concept','SOURCE',
       'https://anythingtranslate.com/translators/royal-english-translator/',
       'PLANNED');
  EXCEPTION WHEN unique_violation THEN blocked:=true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'Source concept uniqueness not enforced'; END IF;
END $$;

UPDATE "GrowthViralPinTest"
  SET "status"='PUBLISHING',"publishClaimAt"=CURRENT_TIMESTAMP
  WHERE id='ci-new-source-draft';
UPDATE "GrowthViralPinTest"
  SET "status"='OUTCOME_UNKNOWN' WHERE id='ci-new-source-draft';

DO $$
DECLARE blocked boolean:=false;
BEGIN
  BEGIN
    UPDATE "GrowthViralPinTest" SET "status"='APPROVED'
      WHERE id='ci-new-source-draft';
  EXCEPTION WHEN raise_exception THEN blocked:=true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'Ambiguous provider outcome was replayable'; END IF;
END $$;
SQL
echo "VIRAL_CI_PRISMA_UPGRADE=PASSED"
echo "VIRAL_CI_EXISTING_ROWS_PRESERVED=true"
echo "VIRAL_CI_APPROVAL_SNAPSHOT_IMMUTABLE=true"
echo "VIRAL_CI_UNKNOWN_WRITE_NO_REPLAY=true"
