-- Add separately approved, original source-linked Pinterest drafts.
-- Existing Growth publisher and all nine live schedules are untouched.
ALTER TABLE "GrowthViralPinTest"
  ADD COLUMN "assetPublicPath" VARCHAR(512),
  ADD COLUMN "title" VARCHAR(100),
  ADD COLUMN "description" VARCHAR(500),
  ADD COLUMN "accountId" TEXT,
  ADD COLUMN "boardId" TEXT,
  ADD COLUMN "scheduledAt" TIMESTAMP(3),
  ADD COLUMN "publicationAttemptKey" VARCHAR(191),
  ADD COLUMN "publishClaimAt" TIMESTAMP(3),
  ADD COLUMN "lastErrorCode" VARCHAR(80);
CREATE UNIQUE INDEX "GrowthViralPinTest_publicationAttemptKey_key"
  ON "GrowthViralPinTest"("publicationAttemptKey");
CREATE INDEX "GrowthViralPinTest_status_scheduledAt_idx"
  ON "GrowthViralPinTest"("status","scheduledAt");

ALTER TABLE "GrowthViralPinTest"
  DROP CONSTRAINT "GrowthViralPinTest_channel_destination_check";
ALTER TABLE "GrowthViralPinTest"
  ADD CONSTRAINT "GrowthViralPinTest_channel_destination_check" CHECK (
    "channel" IN ('SOURCE','SAYTWIST')
    AND "status" IN ('PLANNED','APPROVED','PUBLISHING',
      'OUTCOME_UNKNOWN','PUBLISHED','TRACKED','CANCELLED','FAILED')
    AND (
      ("channel" = 'SOURCE' AND "destinationUrl" LIKE 'https://anythingtranslate.com/translators/%')
      OR ("channel" = 'SAYTWIST' AND "destinationUrl" LIKE 'https://saytwist.com/translators/%')
    )
    AND (
      "status" NOT IN ('APPROVED','PUBLISHING','OUTCOME_UNKNOWN','PUBLISHED')
      OR ("rightsVerified" = true AND "title" IS NOT NULL
        AND "description" IS NOT NULL AND "assetChecksum" IS NOT NULL
        AND "assetPublicPath" IS NOT NULL AND "accountId" IS NOT NULL
        AND "boardId" IS NOT NULL AND "scheduledAt" IS NOT NULL
        AND "approvedAt" IS NOT NULL AND "approvedById" IS NOT NULL
        AND "publicationAttemptKey" IS NOT NULL)
    )
    AND ("status" NOT IN ('PUBLISHED','TRACKED')
         OR ("pinterestPinId" IS NOT NULL AND "publishedAt" IS NOT NULL))
    AND ("status" NOT IN ('PUBLISHING','OUTCOME_UNKNOWN')
         OR "publishClaimAt" IS NOT NULL)
  );

CREATE OR REPLACE FUNCTION "growth_viral_pin_destination_guard"()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."destinationUrl" IS DISTINCT FROM NEW."destinationUrl"
     OR OLD."channel" IS DISTINCT FROM NEW."channel"
     OR OLD."conceptId" IS DISTINCT FROM NEW."conceptId"
     OR (OLD."pinterestPinId" IS NOT NULL
         AND OLD."pinterestPinId" IS DISTINCT FROM NEW."pinterestPinId")
  THEN
    RAISE EXCEPTION 'Growth viral Pin destination and identity are immutable';
  END IF;
  IF OLD."status" NOT IN ('PLANNED') AND OLD."status" IS DISTINCT FROM 'TRACKED'
     AND (
       OLD."title" IS DISTINCT FROM NEW."title"
       OR OLD."description" IS DISTINCT FROM NEW."description"
       OR OLD."assetChecksum" IS DISTINCT FROM NEW."assetChecksum"
       OR OLD."assetPublicPath" IS DISTINCT FROM NEW."assetPublicPath"
       OR OLD."accountId" IS DISTINCT FROM NEW."accountId"
       OR OLD."boardId" IS DISTINCT FROM NEW."boardId"
       OR OLD."scheduledAt" IS DISTINCT FROM NEW."scheduledAt"
       OR OLD."publicationAttemptKey" IS DISTINCT FROM NEW."publicationAttemptKey"
       OR OLD."rightsVerified" IS DISTINCT FROM NEW."rightsVerified"
       OR OLD."approvedAt" IS DISTINCT FROM NEW."approvedAt"
       OR OLD."approvedById" IS DISTINCT FROM NEW."approvedById"
     )
  THEN
    RAISE EXCEPTION 'Approved Growth viral Pin snapshots are immutable';
  END IF;
  IF OLD."status" = 'PUBLISHED' AND NEW."status" <> 'PUBLISHED'
     OR OLD."status" = 'OUTCOME_UNKNOWN' AND NEW."status" NOT IN ('OUTCOME_UNKNOWN','PUBLISHED')
  THEN
    RAISE EXCEPTION 'Growth viral publication cannot be replayed';
  END IF;
  RETURN NEW;
END;
$$;
