import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = path.join(process.cwd(), "prisma/migrations/20261005210000_growth_pinterest_analytics/migration.sql");

describe("Growth Phase 4 analytics migration", () => {
  it("is additive and creates only Pinterest measurement tables", () => {
    const sql = readFileSync(migrationPath, "utf8");
    for (const table of ["GrowthPinterestPin", "GrowthPinterestAccountMetricDaily", "GrowthPinterestPinMetricDaily", "GrowthPinterestAnalyticsState"]) {
      expect(sql).toContain(`CREATE TABLE "${table}"`);
    }
    expect(sql).not.toMatch(/DROP\s+(TABLE|COLUMN|TYPE)/i);
    expect(sql).not.toMatch(/Attribution|Opportunity|GrowthIdea|Publication/i);
  });

  it("adds deterministic daily uniqueness and real range/ranking indexes", () => {
    const sql = readFileSync(migrationPath, "utf8");
    expect(sql).toContain("GrowthPinterestAccountMetricDaily_accountId_metricDate_key");
    expect(sql).toContain("GrowthPinterestPinMetricDaily_pinId_metricDate_key");
    expect(sql).toContain("GrowthPinterestPinMetricDaily_outboundClicks_metricDate_idx");
    expect(sql).toContain("GrowthPinterestPin_accountId_lastAnalyticsSyncAt_idx");
  });
});
