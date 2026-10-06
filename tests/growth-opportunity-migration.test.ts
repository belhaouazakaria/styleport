import fs from "node:fs";
import { describe, expect, it } from "vitest";
const sql = fs.readFileSync(
  "prisma/migrations/20261006220000_growth_opportunity_intelligence/migration.sql",
  "utf8",
);
describe("Phase 7 additive migration", () => {
  it("adds the analysis job and durable evidence graph", () => {
    for (const token of [
      "OPPORTUNITY_INTELLIGENCE_ANALYSIS",
      "GrowthOpportunityAnalysisRun",
      "GrowthContentClusterSnapshot",
      "GrowthContentClusterMembership",
      "GrowthOpportunity",
      "GrowthPinSignal",
    ])
      expect(sql).toContain(token);
  });
  it("does not mutate existing data", () => {
    expect(sql).not.toMatch(/DROP |TRUNCATE |DELETE FROM/i);
  });
});
