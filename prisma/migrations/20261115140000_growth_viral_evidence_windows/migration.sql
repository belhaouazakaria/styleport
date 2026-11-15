-- AlterTable
ALTER TABLE "GrowthViralMetricObservation" ADD COLUMN     "baselineImpressions" BIGINT,
ADD COLUMN     "baselineOutboundClicks" BIGINT,
ADD COLUMN     "baselineSaves" BIGINT,
ADD COLUMN     "windowEnd" TIMESTAMP(3),
ADD COLUMN     "windowStart" TIMESTAMP(3);


ALTER TABLE "GrowthViralMetricObservation" ADD CONSTRAINT "viral_baseline_sample" CHECK (
 ("baselineImpressions" IS NULL AND "baselineSaves" IS NULL AND "baselineOutboundClicks" IS NULL)
 OR ("baselineImpressions" > 0 AND "baselineSaves" BETWEEN 0 AND "baselineImpressions" AND "baselineOutboundClicks" BETWEEN 0 AND "baselineImpressions")
);
ALTER TABLE "GrowthViralMetricObservation" ADD CONSTRAINT "viral_evidence_window" CHECK (("windowStart" IS NULL AND "windowEnd" IS NULL) OR ("windowStart" IS NOT NULL AND "windowEnd" IS NOT NULL AND "windowStart" <= "windowEnd"));
ALTER TABLE "GrowthViralConversion" ADD CONSTRAINT "viral_conversion_status" CHECK ("status" IN ('PROPOSED','EXISTING_TRANSLATOR','TRANSLATOR_DRAFT','NATIVE_READY','CAMPAIGN_PREPARED'));
ALTER TABLE "GrowthAnalyticsCoverage" ADD CONSTRAINT "coverage_supported_window" CHECK ("windowStart" <= "windowEnd" AND "supportedDays" BETWEEN 1 AND 90);
