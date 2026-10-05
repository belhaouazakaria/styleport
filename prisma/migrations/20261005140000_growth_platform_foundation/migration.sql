-- CreateEnum
CREATE TYPE "GrowthIntensity" AS ENUM ('LOW', 'BALANCED', 'AGGRESSIVE', 'CUSTOM');

-- CreateEnum
CREATE TYPE "GrowthJobType" AS ENUM ('FOUNDATION_NOOP');

-- CreateEnum
CREATE TYPE "GrowthJobStatus" AS ENUM ('PENDING', 'CLAIMED', 'RUNNING', 'SUCCEEDED', 'FAILED_RETRYABLE', 'FAILED_TERMINAL', 'CANCELLED');

-- CreateEnum
CREATE TYPE "GrowthActivityActorKind" AS ENUM ('SYSTEM', 'USER', 'WORKER');

-- CreateEnum
CREATE TYPE "GrowthWorkerStatus" AS ENUM ('RUNNING', 'IDLE', 'FAILED');

-- CreateTable
CREATE TABLE "GrowthSettings" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "intensity" "GrowthIntensity" NOT NULL DEFAULT 'BALANCED',
    "workerBatchSize" INTEGER NOT NULL DEFAULT 5,
    "configVersion" INTEGER NOT NULL DEFAULT 1,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GrowthSettings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "GrowthSettings_workerBatchSize_check" CHECK ("workerBatchSize" BETWEEN 1 AND 25),
    CONSTRAINT "GrowthSettings_configVersion_check" CHECK ("configVersion" >= 1)
);

-- CreateTable
CREATE TABLE "GrowthJob" (
    "id" TEXT NOT NULL,
    "type" "GrowthJobType" NOT NULL,
    "status" "GrowthJobStatus" NOT NULL DEFAULT 'PENDING',
    "payload" JSONB,
    "idempotencyKey" TEXT NOT NULL,
    "runAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "workerId" TEXT,
    "claimedAt" TIMESTAMP(3),
    "leaseUntil" TIMESTAMP(3),
    "heartbeatAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "GrowthJob_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "GrowthJob_attemptCount_check" CHECK ("attemptCount" >= 0),
    CONSTRAINT "GrowthJob_maxAttempts_check" CHECK ("maxAttempts" BETWEEN 1 AND 5)
);

-- CreateTable
CREATE TABLE "GrowthActivity" (
    "id" TEXT NOT NULL,
    "actorKind" "GrowthActivityActorKind" NOT NULL,
    "actorUserId" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "fromState" TEXT,
    "toState" TEXT,
    "summary" JSONB,
    "correlationKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GrowthActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrowthWorkerHeartbeat" (
    "workerId" TEXT NOT NULL,
    "invocationId" TEXT NOT NULL,
    "status" "GrowthWorkerStatus" NOT NULL DEFAULT 'IDLE',
    "currentJobId" TEXT,
    "buildVersion" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "heartbeatAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GrowthWorkerHeartbeat_pkey" PRIMARY KEY ("workerId")
);

-- CreateIndex
CREATE INDEX "GrowthSettings_updatedAt_idx" ON "GrowthSettings"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "GrowthJob_idempotencyKey_key" ON "GrowthJob"("idempotencyKey");

-- CreateIndex
CREATE INDEX "GrowthJob_status_runAfter_idx" ON "GrowthJob"("status", "runAfter");

-- CreateIndex
CREATE INDEX "GrowthJob_leaseUntil_idx" ON "GrowthJob"("leaseUntil");

-- CreateIndex
CREATE INDEX "GrowthJob_workerId_status_idx" ON "GrowthJob"("workerId", "status");

-- CreateIndex
CREATE INDEX "GrowthActivity_entityType_entityId_createdAt_idx" ON "GrowthActivity"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "GrowthActivity_createdAt_idx" ON "GrowthActivity"("createdAt");

-- CreateIndex
CREATE INDEX "GrowthActivity_correlationKey_idx" ON "GrowthActivity"("correlationKey");

-- CreateIndex
CREATE INDEX "GrowthWorkerHeartbeat_status_heartbeatAt_idx" ON "GrowthWorkerHeartbeat"("status", "heartbeatAt");

-- AddForeignKey
ALTER TABLE "GrowthSettings" ADD CONSTRAINT "GrowthSettings_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrowthActivity" ADD CONSTRAINT "GrowthActivity_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
