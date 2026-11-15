-- CreateTable
CREATE TABLE "GrowthViralConversion" (
    "id" TEXT NOT NULL,
    "conceptId" TEXT NOT NULL,
    "winningPinTestId" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "decisionId" TEXT,
    "translatorId" TEXT,
    "campaignJobId" TEXT,
    "status" VARCHAR(32) NOT NULL DEFAULT 'PROPOSED',
    "lastErrorCode" VARCHAR(64),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GrowthViralConversion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrowthAnalyticsCoverage" (
    "id" TEXT NOT NULL,
    "source" VARCHAR(24) NOT NULL,
    "accountId" TEXT NOT NULL,
    "metricType" VARCHAR(24) NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "windowEnd" TIMESTAMP(3) NOT NULL,
    "supportedDays" INTEGER NOT NULL,
    "status" VARCHAR(32) NOT NULL,
    "missingPeriods" JSONB NOT NULL,
    "qualityFlags" TEXT[],
    "lastSuccessfulSyncAt" TIMESTAMP(3),
    "lastErrorCode" VARCHAR(64),
    "rateLimit" JSONB NOT NULL,
    "recoveryId" TEXT,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GrowthAnalyticsCoverage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GrowthViralConversion_conceptId_key" ON "GrowthViralConversion"("conceptId");

-- CreateIndex
CREATE UNIQUE INDEX "GrowthViralConversion_decisionId_key" ON "GrowthViralConversion"("decisionId");

-- CreateIndex
CREATE UNIQUE INDEX "GrowthViralConversion_campaignJobId_key" ON "GrowthViralConversion"("campaignJobId");

-- CreateIndex
CREATE INDEX "GrowthViralConversion_status_updatedAt_idx" ON "GrowthViralConversion"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "GrowthAnalyticsCoverage_status_observedAt_idx" ON "GrowthAnalyticsCoverage"("status", "observedAt");

-- CreateIndex
CREATE UNIQUE INDEX "GrowthAnalyticsCoverage_source_accountId_metricType_key" ON "GrowthAnalyticsCoverage"("source", "accountId", "metricType");
