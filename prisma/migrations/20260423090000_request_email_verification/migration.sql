-- Extend enum with verification and publish lifecycle states.
DO $$
BEGIN
  ALTER TYPE "TranslatorRequestStatus" ADD VALUE IF NOT EXISTS 'PENDING_EMAIL_VERIFICATION';
  ALTER TYPE "TranslatorRequestStatus" ADD VALUE IF NOT EXISTS 'PENDING_REVIEW';
  ALTER TYPE "TranslatorRequestStatus" ADD VALUE IF NOT EXISTS 'PUBLISHED';
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END $$;

-- Add email verification + publish notification fields.
ALTER TABLE "TranslatorRequest"
  ADD COLUMN IF NOT EXISTS "emailVerifiedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "verificationTokenHash" TEXT,
  ADD COLUMN IF NOT EXISTS "verificationTokenExpiresAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "verificationEmailSentAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "publishedNotificationSentAt" TIMESTAMP(3);

-- New submissions require explicit email verification before review.
ALTER TABLE "TranslatorRequest"
  ALTER COLUMN "status" SET DEFAULT 'PENDING_EMAIL_VERIFICATION';

-- Existing historical requests should stay reviewable.
UPDATE "TranslatorRequest"
SET "status" = 'PENDING_REVIEW'
WHERE "status" = 'NEW';

CREATE INDEX IF NOT EXISTS "TranslatorRequest_verificationTokenHash_idx"
  ON "TranslatorRequest"("verificationTokenHash");

CREATE INDEX IF NOT EXISTS "TranslatorRequest_requesterEmail_status_idx"
  ON "TranslatorRequest"("requesterEmail", "status");
