-- Persist the configurable owned-domain policy without replacing future admin changes.
ALTER TABLE "GrowthSettings"
ADD COLUMN "ownedDomains" TEXT[] NOT NULL DEFAULT ARRAY[
  'saytwist.com',
  'www.saytwist.com',
  'translator.whattypeof.com'
]::TEXT[];

-- Existing Pins begin ineligible and are safely reclassified by the application.
ALTER TABLE "GrowthPinterestPin"
ADD COLUMN "analyticsEligible" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "GrowthPinterestPin_accountId_isActive_analyticsEligible_lastAnalyticsSyncAt_idx"
ON "GrowthPinterestPin"("accountId", "isActive", "analyticsEligible", "lastAnalyticsSyncAt");
