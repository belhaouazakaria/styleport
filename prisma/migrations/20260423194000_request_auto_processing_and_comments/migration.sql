DO $$
BEGIN
  ALTER TYPE "TranslatorRequestStatus" ADD VALUE IF NOT EXISTS 'VERIFIED';
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "CommentModerationStatus" AS ENUM ('VISIBLE', 'PENDING_REVIEW', 'HIDDEN', 'REJECTED');
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END $$;

CREATE TABLE IF NOT EXISTS "TranslatorComment" (
  "id" TEXT NOT NULL,
  "translatorId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "status" "CommentModerationStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
  "moderationReason" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TranslatorComment_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  ALTER TABLE "TranslatorComment"
    ADD CONSTRAINT "TranslatorComment_translatorId_fkey"
    FOREIGN KEY ("translatorId")
    REFERENCES "Translator"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END $$;

CREATE INDEX IF NOT EXISTS "TranslatorComment_translatorId_status_createdAt_idx"
  ON "TranslatorComment"("translatorId", "status", "createdAt");

CREATE INDEX IF NOT EXISTS "TranslatorComment_status_createdAt_idx"
  ON "TranslatorComment"("status", "createdAt");
