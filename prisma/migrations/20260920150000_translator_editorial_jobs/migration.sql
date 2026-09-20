-- Persistent, review-only editorial generation queue.
CREATE TYPE "TranslatorEditorialJobType" AS ENUM (
  'GENERATE_MISSING',
  'REGENERATE_FULL',
  'REGENERATE_ABOUT',
  'REGENERATE_EXAMPLES',
  'REGENERATE_FAQ',
  'REGENERATE_TIPS'
);

CREATE TYPE "TranslatorEditorialJobStatus" AS ENUM (
  'PENDING',
  'RUNNING',
  'PAUSED',
  'COMPLETED',
  'COMPLETED_WITH_ERRORS',
  'FAILED',
  'CANCELLED'
);

CREATE TYPE "TranslatorEditorialJobItemStatus" AS ENUM (
  'PENDING',
  'PROCESSING',
  'GENERATED',
  'FAILED',
  'SKIPPED',
  'CANCELLED'
);

CREATE TYPE "TranslatorEditorialDraftStatus" AS ENUM (
  'NEEDS_REVIEW',
  'APPROVED',
  'DISCARDED',
  'PUBLISHED'
);

CREATE TABLE "TranslatorEditorialJob" (
  "id" TEXT NOT NULL,
  "type" "TranslatorEditorialJobType" NOT NULL,
  "status" "TranslatorEditorialJobStatus" NOT NULL DEFAULT 'PENDING',
  "requestedById" TEXT,
  "configuration" JSONB,
  "totalItems" INTEGER NOT NULL DEFAULT 0,
  "succeededItems" INTEGER NOT NULL DEFAULT 0,
  "failedItems" INTEGER NOT NULL DEFAULT 0,
  "skippedItems" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TranslatorEditorialJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TranslatorEditorialJobItem" (
  "id" TEXT NOT NULL,
  "jobId" TEXT NOT NULL,
  "translatorId" TEXT NOT NULL,
  "operation" "TranslatorEditorialJobType" NOT NULL,
  "status" "TranslatorEditorialJobItemStatus" NOT NULL DEFAULT 'PENDING',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TranslatorEditorialJobItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TranslatorEditorialDraft" (
  "id" TEXT NOT NULL,
  "jobItemId" TEXT NOT NULL,
  "translatorId" TEXT NOT NULL,
  "status" "TranslatorEditorialDraftStatus" NOT NULL DEFAULT 'NEEDS_REVIEW',
  "payload" JSONB NOT NULL,
  "validation" JSONB NOT NULL,
  "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "publishedAt" TIMESTAMP(3),
  "discardedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TranslatorEditorialDraft_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TranslatorEditorialJobItem_jobId_translatorId_key" ON "TranslatorEditorialJobItem"("jobId", "translatorId");
CREATE UNIQUE INDEX "TranslatorEditorialDraft_jobItemId_key" ON "TranslatorEditorialDraft"("jobItemId");
CREATE INDEX "TranslatorEditorialJob_status_createdAt_idx" ON "TranslatorEditorialJob"("status", "createdAt");
CREATE INDEX "TranslatorEditorialJob_requestedById_createdAt_idx" ON "TranslatorEditorialJob"("requestedById", "createdAt");
CREATE INDEX "TranslatorEditorialJobItem_status_createdAt_idx" ON "TranslatorEditorialJobItem"("status", "createdAt");
CREATE INDEX "TranslatorEditorialJobItem_translatorId_status_idx" ON "TranslatorEditorialJobItem"("translatorId", "status");
CREATE INDEX "TranslatorEditorialDraft_status_createdAt_idx" ON "TranslatorEditorialDraft"("status", "createdAt");
CREATE INDEX "TranslatorEditorialDraft_translatorId_status_idx" ON "TranslatorEditorialDraft"("translatorId", "status");

ALTER TABLE "TranslatorEditorialJob" ADD CONSTRAINT "TranslatorEditorialJob_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TranslatorEditorialJobItem" ADD CONSTRAINT "TranslatorEditorialJobItem_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "TranslatorEditorialJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TranslatorEditorialJobItem" ADD CONSTRAINT "TranslatorEditorialJobItem_translatorId_fkey" FOREIGN KEY ("translatorId") REFERENCES "Translator"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TranslatorEditorialDraft" ADD CONSTRAINT "TranslatorEditorialDraft_jobItemId_fkey" FOREIGN KEY ("jobItemId") REFERENCES "TranslatorEditorialJobItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TranslatorEditorialDraft" ADD CONSTRAINT "TranslatorEditorialDraft_translatorId_fkey" FOREIGN KEY ("translatorId") REFERENCES "Translator"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TranslatorEditorialDraft" ADD CONSTRAINT "TranslatorEditorialDraft_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
