-- TranslationStatus.BLOCKED
DO $$
BEGIN
  IF to_regtype('"TranslationStatus"') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_enum
       WHERE enumtypid = to_regtype('"TranslationStatus"')
         AND enumlabel = 'BLOCKED'
     )
  THEN
    ALTER TYPE "TranslationStatus" ADD VALUE 'BLOCKED';
  END IF;
END $$;

-- UsageProtectionEventType enum
DO $$
BEGIN
  IF to_regtype('"UsageProtectionEventType"') IS NULL THEN
    CREATE TYPE "UsageProtectionEventType" AS ENUM (
      'EMERGENCY_SHUTDOWN',
      'MANUAL_REENABLE'
    );
  END IF;
END $$;

-- UsageProtectionState table
CREATE TABLE IF NOT EXISTS "UsageProtectionState" (
  "id" TEXT NOT NULL DEFAULT 'global',
  "usageProtectionEnabled" BOOLEAN NOT NULL DEFAULT true,
  "ipLimitPerMinute" INTEGER NOT NULL DEFAULT 5,
  "ipLimitPerHour" INTEGER NOT NULL DEFAULT 50,
  "ipLimitPerDay" INTEGER NOT NULL DEFAULT 200,
  "globalDailyTokenCap" INTEGER NOT NULL DEFAULT 200000,
  "autoEmergencyShutdownEnabled" BOOLEAN NOT NULL DEFAULT true,
  "translationsEnabled" BOOLEAN NOT NULL DEFAULT true,
  "shutdownReason" TEXT,
  "shutdownTriggeredAt" TIMESTAMP(3),
  "alertEmail" TEXT,
  "lastShutdownEventId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UsageProtectionState_pkey" PRIMARY KEY ("id")
);

-- UsageProtectionEvent table
CREATE TABLE IF NOT EXISTS "UsageProtectionEvent" (
  "id" TEXT NOT NULL,
  "stateId" TEXT NOT NULL,
  "type" "UsageProtectionEventType" NOT NULL,
  "reason" TEXT NOT NULL,
  "tokenUsageAtTrigger" INTEGER,
  "tokenCapAtTrigger" INTEGER,
  "alertEmail" TEXT,
  "alertSentAt" TIMESTAMP(3),
  "alertError" TEXT,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UsageProtectionEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "UsageProtectionEvent_stateId_createdAt_idx"
  ON "UsageProtectionEvent"("stateId", "createdAt");
CREATE INDEX IF NOT EXISTS "UsageProtectionEvent_type_createdAt_idx"
  ON "UsageProtectionEvent"("type", "createdAt");

-- FKs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'UsageProtectionEvent_stateId_fkey'
  ) THEN
    ALTER TABLE "UsageProtectionEvent"
      ADD CONSTRAINT "UsageProtectionEvent_stateId_fkey"
      FOREIGN KEY ("stateId") REFERENCES "UsageProtectionState"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'UsageProtectionState_lastShutdownEventId_fkey'
  ) THEN
    ALTER TABLE "UsageProtectionState"
      ADD CONSTRAINT "UsageProtectionState_lastShutdownEventId_fkey"
      FOREIGN KEY ("lastShutdownEventId") REFERENCES "UsageProtectionEvent"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- TranslationLog indexes for quota/reporting
CREATE INDEX IF NOT EXISTS "TranslationLog_ipHash_createdAt_idx"
  ON "TranslationLog"("ipHash", "createdAt");
CREATE INDEX IF NOT EXISTS "TranslationLog_errorCode_createdAt_idx"
  ON "TranslationLog"("errorCode", "createdAt");

-- Singleton seed row
INSERT INTO "UsageProtectionState" (
  "id",
  "usageProtectionEnabled",
  "ipLimitPerMinute",
  "ipLimitPerHour",
  "ipLimitPerDay",
  "globalDailyTokenCap",
  "autoEmergencyShutdownEnabled",
  "translationsEnabled",
  "updatedAt"
)
VALUES ('global', true, 5, 50, 200, 200000, true, true, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
