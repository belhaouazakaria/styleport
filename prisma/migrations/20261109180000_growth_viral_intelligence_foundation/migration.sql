-- Growth Viral Intelligence foundation. Production rollout is separately approved:
-- no schedule, Pin mutation, AI call or existing Growth setting is enabled here.
CREATE TABLE "GrowthViralProgramSettings" (
  "id" TEXT NOT NULL DEFAULT 'global',
  "mode" VARCHAR(10) NOT NULL DEFAULT 'PAUSED',
  "sourceSharePercent" INTEGER NOT NULL DEFAULT 50,
  "maxPinsPerDay" INTEGER NOT NULL DEFAULT 3,
  "configVersion" INTEGER NOT NULL DEFAULT 1,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GrowthViralProgramSettings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GrowthViralProgramSettings_policy_check" CHECK (
    "mode" IN ('PAUSED','REVIEW','ACTIVE') AND
    "sourceSharePercent" BETWEEN 0 AND 100 AND
    "maxPinsPerDay" BETWEEN 0 AND 10 AND "configVersion" > 0
  )
);
CREATE INDEX "GrowthViralProgramSettings_updatedAt_idx"
  ON "GrowthViralProgramSettings"("updatedAt");

CREATE TABLE "GrowthViralConcept" (
  "id" TEXT NOT NULL,
  "title" VARCHAR(100) NOT NULL,
  "normalizedKey" VARCHAR(160) NOT NULL,
  "sourceUrl" VARCHAR(512) NOT NULL,
  "sourceHost" VARCHAR(80) NOT NULL DEFAULT 'anythingtranslate.com',
  "rightsVerified" BOOLEAN NOT NULL DEFAULT false,
  "status" VARCHAR(20) NOT NULL DEFAULT 'DISCOVERED',
  "linkedTranslatorId" TEXT,
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GrowthViralConcept_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GrowthViralConcept_key" UNIQUE ("normalizedKey"),
  CONSTRAINT "GrowthViralConcept_url_key" UNIQUE ("sourceUrl"),
  CONSTRAINT "GrowthViralConcept_source_check" CHECK (
    "sourceHost" = 'anythingtranslate.com'
    AND "sourceUrl" LIKE 'https://anythingtranslate.com/translators/%'
    AND length("normalizedKey") >= 3
    AND "status" IN ('DISCOVERED','REVIEW','TESTING','WINNER','PREPARING','ACTIVE','REJECTED')
  )
);
CREATE INDEX "GrowthViralConcept_status_lastSeenAt_idx"
  ON "GrowthViralConcept"("status","lastSeenAt");
CREATE INDEX "GrowthViralConcept_linkedTranslatorId_idx"
  ON "GrowthViralConcept"("linkedTranslatorId");

CREATE TABLE "GrowthViralPinTest" (
  "id" TEXT NOT NULL,
  "conceptId" TEXT NOT NULL,
  "channel" VARCHAR(10) NOT NULL,
  "destinationUrl" VARCHAR(512) NOT NULL,
  "assetChecksum" VARCHAR(64),
  "rightsVerified" BOOLEAN NOT NULL DEFAULT false,
  "status" VARCHAR(24) NOT NULL DEFAULT 'PLANNED',
  "pinterestPinId" VARCHAR(191),
  "approvedById" TEXT,
  "approvedAt" TIMESTAMP(3),
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GrowthViralPinTest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GrowthViralPinTest_pinterestPinId_key" UNIQUE ("pinterestPinId"),
  CONSTRAINT "GrowthViralPinTest_channel_destination_check" CHECK (
    "channel" IN ('SOURCE','SAYTWIST')
    AND "status" IN ('PLANNED','APPROVED','PUBLISHED','CANCELLED','FAILED')
    AND (
      ("channel" = 'SOURCE' AND "destinationUrl" LIKE 'https://anythingtranslate.com/translators/%')
      OR ("channel" = 'SAYTWIST' AND "destinationUrl" LIKE 'https://saytwist.com/translators/%')
    )
    AND (
      "channel" <> 'SOURCE' OR "status" NOT IN ('APPROVED','PUBLISHED')
      OR "rightsVerified" = true
    )
    AND ("status" <> 'PUBLISHED' OR ("pinterestPinId" IS NOT NULL AND "publishedAt" IS NOT NULL))
  ),
  CONSTRAINT "GrowthViralPinTest_conceptId_fkey"
    FOREIGN KEY ("conceptId") REFERENCES "GrowthViralConcept"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "GrowthViralPinTest_channel_status_createdAt_idx"
  ON "GrowthViralPinTest"("channel","status","createdAt");
CREATE INDEX "GrowthViralPinTest_conceptId_createdAt_idx"
  ON "GrowthViralPinTest"("conceptId","createdAt");

CREATE TABLE "GrowthViralMetricObservation" (
  "id" TEXT NOT NULL,
  "pinTestId" TEXT NOT NULL,
  "observedAt" TIMESTAMP(3) NOT NULL,
  "pinterestDataStatus" VARCHAR(12) NOT NULL,
  "impressions" BIGINT,
  "saves" BIGINT,
  "outboundClicks" BIGINT,
  "baselineSaveRate" DOUBLE PRECISION,
  "baselineOutboundRate" DOUBLE PRECISION,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GrowthViralMetricObservation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GrowthViralMetricObservation_pinTestId_observedAt_key" UNIQUE ("pinTestId","observedAt"),
  CONSTRAINT "GrowthViralMetricObservation_valid_check" CHECK (
    "pinterestDataStatus" IN ('READY','PROCESSING','MISSING')
    AND ("impressions" IS NULL OR "impressions" >= 0)
    AND ("saves" IS NULL OR "saves" >= 0)
    AND ("outboundClicks" IS NULL OR "outboundClicks" >= 0)
    AND ("baselineSaveRate" IS NULL OR "baselineSaveRate" BETWEEN 0 AND 1)
    AND ("baselineOutboundRate" IS NULL OR "baselineOutboundRate" BETWEEN 0 AND 1)
  ),
  CONSTRAINT "GrowthViralMetricObservation_pinTestId_fkey"
    FOREIGN KEY ("pinTestId") REFERENCES "GrowthViralPinTest"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "GrowthViralMetricObservation_pinTestId_observedAt_idx"
  ON "GrowthViralMetricObservation"("pinTestId","observedAt");

CREATE TABLE "GrowthViralNicheProposal" (
  "id" TEXT NOT NULL,
  "conceptId" TEXT NOT NULL,
  "normalizedKey" VARCHAR(160) NOT NULL,
  "title" VARCHAR(100) NOT NULL,
  "intent" VARCHAR(280) NOT NULL,
  "relationship" VARCHAR(24) NOT NULL,
  "evidence" VARCHAR(280) NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'PROPOSED',
  "linkedTranslatorId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GrowthViralNicheProposal_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GrowthViralNicheProposal_conceptId_normalizedKey_key" UNIQUE ("conceptId","normalizedKey"),
  CONSTRAINT "GrowthViralNicheProposal_valid_check" CHECK (
    "status" IN ('PROPOSED','REVIEW','PREPARING','ACTIVE','REJECTED')
    AND "relationship" IN ('SUBNICHE','ADJACENT','STYLE_VARIATION','AUDIENCE_VARIATION')
  ),
  CONSTRAINT "GrowthViralNicheProposal_conceptId_fkey"
    FOREIGN KEY ("conceptId") REFERENCES "GrowthViralConcept"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "GrowthViralNicheProposal_status_createdAt_idx"
  ON "GrowthViralNicheProposal"("status","createdAt");

-- Historical Pin destinations cannot be repointed. Post a separate original
-- SayTwist Pin for any qualifying competitor-inspired concept instead.
CREATE OR REPLACE FUNCTION "growth_viral_pin_destination_guard"()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."destinationUrl" IS DISTINCT FROM NEW."destinationUrl"
     OR OLD."channel" IS DISTINCT FROM NEW."channel"
     OR OLD."conceptId" IS DISTINCT FROM NEW."conceptId"
     OR OLD."pinterestPinId" IS DISTINCT FROM NEW."pinterestPinId"
        AND OLD."pinterestPinId" IS NOT NULL
  THEN
    RAISE EXCEPTION 'Growth viral Pin destination and identity are immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "growth_viral_pin_immutable_destination"
  BEFORE UPDATE ON "GrowthViralPinTest"
  FOR EACH ROW EXECUTE FUNCTION "growth_viral_pin_destination_guard"();

CREATE OR REPLACE FUNCTION "growth_viral_metric_append_only"()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Growth viral metric observations are append-only';
END;
$$;
CREATE TRIGGER "growth_viral_metric_no_update_delete"
  BEFORE UPDATE OR DELETE ON "GrowthViralMetricObservation"
  FOR EACH ROW EXECUTE FUNCTION "growth_viral_metric_append_only"();

INSERT INTO "GrowthViralProgramSettings" ("id","mode","sourceSharePercent","maxPinsPerDay")
VALUES ('global','PAUSED',50,3)
ON CONFLICT ("id") DO NOTHING;
