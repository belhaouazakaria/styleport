DO $$
BEGIN
  CREATE TYPE "FeaturedSource" AS ENUM ('MANUAL', 'AUTO');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Translator"
  ADD COLUMN IF NOT EXISTS "featuredRank" INTEGER,
  ADD COLUMN IF NOT EXISTS "featuredSource" "FeaturedSource" NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN IF NOT EXISTS "shareImagePath" TEXT,
  ADD COLUMN IF NOT EXISTS "shareImageHash" TEXT,
  ADD COLUMN IF NOT EXISTS "shareImageUpdatedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Translator_isFeatured_featuredRank_idx"
  ON "Translator"("isFeatured", "featuredRank");
