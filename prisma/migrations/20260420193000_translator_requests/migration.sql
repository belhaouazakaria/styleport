-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TranslatorRequestStatus') THEN
    CREATE TYPE "TranslatorRequestStatus" AS ENUM (
      'NEW',
      'REVIEWING',
      'DRAFT_GENERATED',
      'APPROVED',
      'REJECTED',
      'COMPLETED'
    );
  END IF;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "TranslatorRequest" (
  "id" TEXT NOT NULL,
  "requesterEmail" TEXT,
  "requestedName" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "exampleInput" TEXT,
  "desiredStyle" TEXT,
  "suggestedCategory" TEXT,
  "audience" TEXT,
  "notes" TEXT,
  "adminNotes" TEXT,
  "status" "TranslatorRequestStatus" NOT NULL DEFAULT 'NEW',
  "aiDraftJson" JSONB,
  "aiDraftGeneratedAt" TIMESTAMP(3),
  "createdTranslatorId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TranslatorRequest_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX IF NOT EXISTS "TranslatorRequest_status_createdAt_idx"
  ON "TranslatorRequest"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "TranslatorRequest_createdAt_idx"
  ON "TranslatorRequest"("createdAt");
CREATE INDEX IF NOT EXISTS "TranslatorRequest_createdTranslatorId_idx"
  ON "TranslatorRequest"("createdTranslatorId");

-- FK
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'TranslatorRequest_createdTranslatorId_fkey'
  ) THEN
    ALTER TABLE "TranslatorRequest"
      ADD CONSTRAINT "TranslatorRequest_createdTranslatorId_fkey"
      FOREIGN KEY ("createdTranslatorId") REFERENCES "Translator"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
