-- PostgreSQL requires a commit boundary before newly added enum values
-- can be used in defaults/updates. This migration is intentionally enum-only.
DO $$
BEGIN
  ALTER TYPE "TranslatorRequestStatus" ADD VALUE IF NOT EXISTS 'PENDING_EMAIL_VERIFICATION';
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END $$;
