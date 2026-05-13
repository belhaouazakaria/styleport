-- CreateEnum
CREATE TYPE "IndexingProvider" AS ENUM ('GOOGLE_INDEXING_API');

-- CreateEnum
CREATE TYPE "IndexingSource" AS ENUM ('MANUAL_SINGLE', 'MANUAL_BULK', 'AUTO_ACTIVE');

-- CreateEnum
CREATE TYPE "IndexingStatus" AS ENUM ('PENDING', 'SUBMITTED', 'FAILED', 'SKIPPED', 'DRY_RUN');

-- CreateTable
CREATE TABLE "IndexingLog" (
    "id" TEXT NOT NULL,
    "translatorId" TEXT,
    "url" TEXT NOT NULL,
    "source" "IndexingSource" NOT NULL,
    "status" "IndexingStatus" NOT NULL DEFAULT 'PENDING',
    "provider" "IndexingProvider" NOT NULL DEFAULT 'GOOGLE_INDEXING_API',
    "message" TEXT,
    "responseJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IndexingLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IndexingLog_translatorId_createdAt_idx" ON "IndexingLog"("translatorId", "createdAt");

-- CreateIndex
CREATE INDEX "IndexingLog_status_createdAt_idx" ON "IndexingLog"("status", "createdAt");

-- CreateIndex
CREATE INDEX "IndexingLog_source_createdAt_idx" ON "IndexingLog"("source", "createdAt");

-- CreateIndex
CREATE INDEX "IndexingLog_provider_createdAt_idx" ON "IndexingLog"("provider", "createdAt");

-- AddForeignKey
ALTER TABLE "IndexingLog" ADD CONSTRAINT "IndexingLog_translatorId_fkey" FOREIGN KEY ("translatorId") REFERENCES "Translator"("id") ON DELETE SET NULL ON UPDATE CASCADE;
