ALTER TYPE "GrowthJobType" ADD VALUE 'PINTEREST_PIN_PUBLISH';
ALTER TYPE "GrowthJobType" ADD VALUE 'PINTEREST_PIN_RECONCILE';

CREATE TYPE "GrowthPinApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'DEFERRED', 'SUPERSEDED');
CREATE TYPE "GrowthPublicationStatus" AS ENUM ('SCHEDULED', 'CLAIMED', 'PUBLISHING', 'PUBLISHED', 'RECONCILING', 'RECONCILED', 'FAILED_RETRYABLE', 'FAILED_TERMINAL', 'CANCELLED');
CREATE TYPE "GrowthPublicationTimingMode" AS ENUM ('COLD_START', 'EXPLOIT', 'EXPLORE', 'ADMIN_OVERRIDE');

CREATE TABLE "GrowthPinApproval" (
  "id" TEXT NOT NULL,
  "candidateId" TEXT NOT NULL,
  "candidateRevision" INTEGER NOT NULL,
  "status" "GrowthPinApprovalStatus" NOT NULL DEFAULT 'PENDING',
  "approvedById" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "accountId" TEXT,
  "boardId" TEXT,
  "scheduledAt" TIMESTAMP(3),
  "snapshotChecksum" VARCHAR(64) NOT NULL,
  "snapshot" JSONB NOT NULL,
  "approvalPolicyVersion" VARCHAR(64) NOT NULL,
  "notes" VARCHAR(500),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GrowthPinApproval_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GrowthPinApproval_checksum_check" CHECK ("snapshotChecksum" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "GrowthPinApproval_revision_check" CHECK ("candidateRevision" > 0),
  CONSTRAINT "GrowthPinApproval_approved_review_check" CHECK ("status" <> 'APPROVED' OR ("approvedById" IS NOT NULL AND "reviewedAt" IS NOT NULL AND "accountId" IS NOT NULL AND "boardId" IS NOT NULL AND "scheduledAt" IS NOT NULL))
);

CREATE TABLE "GrowthPinPublication" (
  "id" TEXT NOT NULL,
  "candidateId" TEXT NOT NULL,
  "approvalId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "boardId" TEXT NOT NULL,
  "attributionRefId" TEXT,
  "pinterestPinId" TEXT,
  "idempotencyKey" VARCHAR(191) NOT NULL,
  "publishJobId" TEXT,
  "reconcileJobId" TEXT,
  "scheduledAt" TIMESTAMP(3) NOT NULL,
  "publishedAt" TIMESTAMP(3),
  "status" "GrowthPublicationStatus" NOT NULL DEFAULT 'SCHEDULED',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "timingModelVersion" VARCHAR(64) NOT NULL,
  "timingMode" "GrowthPublicationTimingMode" NOT NULL,
  "timingEvidence" JSONB NOT NULL,
  "lastErrorCode" VARCHAR(80),
  "lastErrorSummary" VARCHAR(500),
  "lastAttemptAt" TIMESTAMP(3),
  "reconciliationStartedAt" TIMESTAMP(3),
  "reconciledAt" TIMESTAMP(3),
  "lastRateLimitLimit" VARCHAR(64),
  "lastRateLimitRemaining" VARCHAR(64),
  "lastRateLimitReset" VARCHAR(128),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GrowthPinPublication_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GrowthPinPublication_attempt_check" CHECK ("attemptCount" >= 0),
  CONSTRAINT "GrowthPinPublication_final_state_check" CHECK ("status" NOT IN ('PUBLISHED', 'RECONCILED') OR ("pinterestPinId" IS NOT NULL AND "publishedAt" IS NOT NULL)),
  CONSTRAINT "GrowthPinPublication_reconciled_check" CHECK ("status" <> 'RECONCILED' OR "reconciledAt" IS NOT NULL)
);

CREATE UNIQUE INDEX "GrowthPinPublication_approvalId_key" ON "GrowthPinPublication"("approvalId");
CREATE UNIQUE INDEX "GrowthPinPublication_attributionRefId_key" ON "GrowthPinPublication"("attributionRefId");
CREATE UNIQUE INDEX "GrowthPinPublication_pinterestPinId_key" ON "GrowthPinPublication"("pinterestPinId");
CREATE UNIQUE INDEX "GrowthPinPublication_idempotencyKey_key" ON "GrowthPinPublication"("idempotencyKey");
CREATE UNIQUE INDEX "GrowthPinPublication_publishJobId_key" ON "GrowthPinPublication"("publishJobId");
CREATE UNIQUE INDEX "GrowthPinPublication_reconcileJobId_key" ON "GrowthPinPublication"("reconcileJobId");
CREATE UNIQUE INDEX "GrowthPinApproval_one_active_candidate_key" ON "GrowthPinApproval"("candidateId") WHERE "status" = 'APPROVED';
CREATE INDEX "GrowthPinApproval_candidateId_status_createdAt_idx" ON "GrowthPinApproval"("candidateId", "status", "createdAt");
CREATE INDEX "GrowthPinApproval_status_scheduledAt_idx" ON "GrowthPinApproval"("status", "scheduledAt");
CREATE INDEX "GrowthPinApproval_accountId_scheduledAt_idx" ON "GrowthPinApproval"("accountId", "scheduledAt");
CREATE INDEX "GrowthPinPublication_status_scheduledAt_idx" ON "GrowthPinPublication"("status", "scheduledAt");
CREATE INDEX "GrowthPinPublication_accountId_scheduledAt_idx" ON "GrowthPinPublication"("accountId", "scheduledAt");
CREATE INDEX "GrowthPinPublication_accountId_publishedAt_idx" ON "GrowthPinPublication"("accountId", "publishedAt");
CREATE INDEX "GrowthPinPublication_pinterestPinId_idx" ON "GrowthPinPublication"("pinterestPinId");

ALTER TABLE "GrowthPinApproval" ADD CONSTRAINT "GrowthPinApproval_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "GrowthPinCandidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GrowthPinApproval" ADD CONSTRAINT "GrowthPinApproval_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GrowthPinApproval" ADD CONSTRAINT "GrowthPinApproval_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "GrowthPinterestAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GrowthPinApproval" ADD CONSTRAINT "GrowthPinApproval_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "GrowthPinterestBoard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GrowthPinPublication" ADD CONSTRAINT "GrowthPinPublication_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "GrowthPinCandidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GrowthPinPublication" ADD CONSTRAINT "GrowthPinPublication_approvalId_fkey" FOREIGN KEY ("approvalId") REFERENCES "GrowthPinApproval"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GrowthPinPublication" ADD CONSTRAINT "GrowthPinPublication_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "GrowthPinterestAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GrowthPinPublication" ADD CONSTRAINT "GrowthPinPublication_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "GrowthPinterestBoard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GrowthPinPublication" ADD CONSTRAINT "GrowthPinPublication_attributionRefId_fkey" FOREIGN KEY ("attributionRefId") REFERENCES "GrowthAttributionRef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GrowthPinPublication" ADD CONSTRAINT "GrowthPinPublication_pinterestPinId_fkey" FOREIGN KEY ("pinterestPinId") REFERENCES "GrowthPinterestPin"("pinterestPinId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GrowthPinPublication" ADD CONSTRAINT "GrowthPinPublication_publishJobId_fkey" FOREIGN KEY ("publishJobId") REFERENCES "GrowthJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GrowthPinPublication" ADD CONSTRAINT "GrowthPinPublication_reconcileJobId_fkey" FOREIGN KEY ("reconcileJobId") REFERENCES "GrowthJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE FUNCTION growth_pin_approval_snapshot_immutable() RETURNS trigger AS $$
BEGIN
  IF OLD."status" IN ('APPROVED', 'SUPERSEDED') AND (
    NEW."candidateId" IS DISTINCT FROM OLD."candidateId"
    OR NEW."candidateRevision" IS DISTINCT FROM OLD."candidateRevision"
    OR NEW."approvedById" IS DISTINCT FROM OLD."approvedById"
    OR NEW."reviewedAt" IS DISTINCT FROM OLD."reviewedAt"
    OR NEW."accountId" IS DISTINCT FROM OLD."accountId"
    OR NEW."boardId" IS DISTINCT FROM OLD."boardId"
    OR NEW."scheduledAt" IS DISTINCT FROM OLD."scheduledAt"
    OR NEW."snapshot" IS DISTINCT FROM OLD."snapshot"
    OR NEW."snapshotChecksum" IS DISTINCT FROM OLD."snapshotChecksum"
    OR NEW."approvalPolicyVersion" IS DISTINCT FROM OLD."approvalPolicyVersion"
  ) THEN
    RAISE EXCEPTION 'approved Pin snapshot is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "GrowthPinApproval_snapshot_immutable" BEFORE UPDATE ON "GrowthPinApproval" FOR EACH ROW EXECUTE FUNCTION growth_pin_approval_snapshot_immutable();
