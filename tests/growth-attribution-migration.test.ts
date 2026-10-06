import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(path.join(process.cwd(), "prisma/migrations/20261006150000_growth_attribution/migration.sql"), "utf8");

describe("Growth Phase 5 attribution migration", () => {
  it("is additive and creates the accepted attribution boundary", () => {
    for (const table of ["GrowthAttributionRef", "GrowthAttributionSession", "GrowthAttributionEvent", "GrowthAttributionDailyAggregate"]) {
      expect(sql).toContain(`CREATE TABLE \"${table}\"`);
    }
    expect(sql).toContain("attributionEnabled");
    expect(sql).toContain("attributionWindowDays");
    expect(sql).toContain("ATTRIBUTION_RETENTION_CLEANUP");
    expect(sql).not.toMatch(/DROP TABLE|DROP COLUMN|TRUNCATE/i);
  });

  it("enforces dedupe, retention, and bounded settings indexes or constraints", () => {
    expect(sql).toContain("GrowthAttributionSession_tokenHash_key");
    expect(sql).toContain("GrowthAttributionEvent_translationLogId_key");
    expect(sql).toContain("GrowthAttributionEvent_retentionAt_idx");
    expect(sql).toContain("GrowthAttributionDailyAggregate_dimensionKey_key");
    expect(sql).toContain("GrowthSettings_attributionWindowDays_check");
  });
});
