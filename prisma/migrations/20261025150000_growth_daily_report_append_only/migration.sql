-- Immutable Growth report snapshots. Delivery audit lives in its own
-- mutable state table and remains unaffected by this restriction.
-- This migration is additive: existing reports are not rewritten.
CREATE FUNCTION "guardGrowthDailyReportAppendOnly"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'GrowthDailyReport archive is immutable';
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER "GrowthDailyReport_append_only"
  BEFORE UPDATE OR DELETE ON "GrowthDailyReport"
  FOR EACH ROW EXECUTE FUNCTION "guardGrowthDailyReportAppendOnly"();
