-- CreateTable
CREATE TABLE "GrowthApprovalRequest" (
    "id" TEXT NOT NULL,
    "kind" VARCHAR(32) NOT NULL,
    "subjectId" VARCHAR(191) NOT NULL,
    "dedupeKey" VARCHAR(191) NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "snapshotChecksum" VARCHAR(64) NOT NULL,
    "status" VARCHAR(24) NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "decidedAt" TIMESTAMP(3),
    "decidedById" TEXT,
    "decisionChannel" VARCHAR(16),
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GrowthApprovalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrowthNotification" (
    "id" TEXT NOT NULL,
    "dedupeKey" VARCHAR(191) NOT NULL,
    "requestId" TEXT,
    "payload" JSONB NOT NULL,
    "status" VARCHAR(24) NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attemptedAt" TIMESTAMP(3),
    "providerMessageId" TEXT,
    "providerChannelId" TEXT,
    "lastErrorCode" VARCHAR(64),
    "finalizedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GrowthNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrowthDiscordInteraction" (
    "id" VARCHAR(24) NOT NULL,
    "requestId" TEXT NOT NULL,
    "action" VARCHAR(16) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "GrowthDiscordInteraction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GrowthApprovalRequest_dedupeKey_key" ON "GrowthApprovalRequest"("dedupeKey");

-- CreateIndex
CREATE INDEX "GrowthApprovalRequest_status_expiresAt_idx" ON "GrowthApprovalRequest"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "GrowthApprovalRequest_kind_subjectId_idx" ON "GrowthApprovalRequest"("kind", "subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "GrowthNotification_dedupeKey_key" ON "GrowthNotification"("dedupeKey");

-- CreateIndex
CREATE INDEX "GrowthNotification_status_nextAttemptAt_idx" ON "GrowthNotification"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "GrowthDiscordInteraction_processedAt_receivedAt_idx" ON "GrowthDiscordInteraction"("processedAt", "receivedAt");

-- AddForeignKey
ALTER TABLE "GrowthNotification" ADD CONSTRAINT "GrowthNotification_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "GrowthApprovalRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrowthDiscordInteraction" ADD CONSTRAINT "GrowthDiscordInteraction_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "GrowthApprovalRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "GrowthApprovalRequest" ADD CONSTRAINT "approval_kind" CHECK ("kind" IN ('NATIVE_PIN','SOURCE_PIN','PROTECTED_OPERATION')),
 ADD CONSTRAINT "approval_status" CHECK ("status" IN ('PENDING','APPROVED','REJECTED','EXPIRED','STALE')),
 ADD CONSTRAINT "approval_checksum" CHECK ("snapshotChecksum" ~ '^[a-f0-9]{64}$'),
 ADD CONSTRAINT "approval_expiry" CHECK ("expiresAt" > "createdAt"),
 ADD CONSTRAINT "approval_decision" CHECK (("status" = 'PENDING' AND "decidedAt" IS NULL) OR ("status" <> 'PENDING' AND "decidedAt" IS NOT NULL));
ALTER TABLE "GrowthNotification" ADD CONSTRAINT "notification_status" CHECK ("status" IN ('QUEUED','SENDING','SENT','UNKNOWN','RETRY','DEAD')),
 ADD CONSTRAINT "notification_attempts" CHECK ("attempts" BETWEEN 0 AND 8);
ALTER TABLE "GrowthDiscordInteraction" ADD CONSTRAINT "interaction_action" CHECK ("action" IN ('APPROVE','REJECT'));

CREATE FUNCTION growth_approval_evidence_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Approval evidence cannot be deleted'; END IF;
 IF ROW(OLD."kind", OLD."subjectId", OLD."dedupeKey", OLD."ownerUserId", OLD."snapshot", OLD."snapshotChecksum", OLD."expiresAt", OLD."createdAt")
    IS DISTINCT FROM ROW(NEW."kind", NEW."subjectId", NEW."dedupeKey", NEW."ownerUserId", NEW."snapshot", NEW."snapshotChecksum", NEW."expiresAt", NEW."createdAt")
 THEN RAISE EXCEPTION 'Approval evidence is immutable'; END IF;
 IF OLD."status" <> 'PENDING' AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'Approval decision is terminal'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "growth_approval_evidence_guard" BEFORE UPDATE OR DELETE ON "GrowthApprovalRequest"
 FOR EACH ROW EXECUTE FUNCTION growth_approval_evidence_guard();
