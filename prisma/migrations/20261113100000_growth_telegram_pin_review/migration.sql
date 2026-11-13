-- Additive. Never activates publishing or Telegram by migration alone.
ALTER TABLE "GrowthSettings"
  ADD COLUMN "defaultPinterestDestinationDomain" VARCHAR(80) NOT NULL DEFAULT 'saytwist.com';
ALTER TABLE "GrowthSettings"
  ADD CONSTRAINT "GrowthSettings_defaultPinterestDestinationDomain_check"
  CHECK ("defaultPinterestDestinationDomain" IN ('saytwist.com', 'translator.whattypeof.com'));

CREATE TABLE "GrowthTelegramPinReview" (
  "id" TEXT NOT NULL,
  "candidateId" TEXT NOT NULL,
  "candidateRevision" INTEGER NOT NULL,
  "accountId" TEXT NOT NULL,
  "boardId" TEXT NOT NULL,
  "scheduledAt" TIMESTAMP(3) NOT NULL,
  "ownerUserId" TEXT NOT NULL,
  "telegramMessageId" INTEGER,
  "status" VARCHAR(24) NOT NULL DEFAULT 'QUEUED',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "sentAt" TIMESTAMP(3),
  "actedAt" TIMESTAMP(3),
  "destinationDomain" VARCHAR(80),
  "publicationId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GrowthTelegramPinReview_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GrowthTelegramPinReview_status_check"
    CHECK ("status" IN ('QUEUED', 'SENT', 'PROCESSING', 'APPROVED', 'REJECTED', 'FAILED', 'UNKNOWN')),
  CONSTRAINT "GrowthTelegramPinReview_domain_check"
    CHECK ("destinationDomain" IS NULL OR "destinationDomain" IN
      ('saytwist.com', 'translator.whattypeof.com'))
);
CREATE UNIQUE INDEX "GrowthTelegramPinReview_candidateId_key"
  ON "GrowthTelegramPinReview"("candidateId");
CREATE INDEX "GrowthTelegramPinReview_status_expiresAt_idx"
  ON "GrowthTelegramPinReview"("status", "expiresAt");
ALTER TABLE "GrowthTelegramPinReview"
  ADD CONSTRAINT "GrowthTelegramPinReview_candidateId_fkey" FOREIGN KEY ("candidateId")
  REFERENCES "GrowthPinCandidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GrowthTelegramPinReview"
  ADD CONSTRAINT "GrowthTelegramPinReview_ownerUserId_fkey" FOREIGN KEY ("ownerUserId")
  REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
