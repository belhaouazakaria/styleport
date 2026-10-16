import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = path.join(
  process.cwd(),
  "prisma/migrations/20261016120000_growth_analytics_gap_recovery/migration.sql",
);

describe("Growth Phase 12.2 recovery migration", () => {
  it("adds only recovery state and the bounded read job type", () => {
    const sql = readFileSync(migrationPath, "utf8");
    expect(sql).toContain("PINTEREST_ANALYTICS_GAP_RECOVERY");
    expect(sql).toContain('CREATE TABLE "GrowthPinterestAnalyticsRecovery"');
    expect(sql).toContain('CREATE TABLE "GrowthPinterestAnalyticsRecoveryTask"');
    expect(sql).toContain("requestBudget_check");
    expect(sql).toContain("'CANCELLED'");
    expect(sql).toContain('ALTER COLUMN "impressions" DROP NOT NULL');
    expect(sql).not.toMatch(/DROP\s+(TABLE|COLUMN|TYPE)/i);
    expect(sql).not.toMatch(/ALTER\s+COLUMN\s+.+TYPE|RENAME\s+(TABLE|COLUMN)/i);
    expect(sql).not.toMatch(/DELETE\s+FROM|UPDATE\s+"GrowthLearningRun"/i);
  });

  it("is backward-compatible with the deployed Phase 12.1 write contract", () => {
    const sql = readFileSync(migrationPath, "utf8");
    expect(sql).toContain('ALTER TYPE "GrowthJobType" ADD VALUE');
    expect(sql).toContain('CREATE TABLE "GrowthPinterestAnalyticsRecovery"');
    expect(sql).toContain('CREATE TABLE "GrowthPinterestAnalyticsRecoveryTask"');
    expect(sql).not.toMatch(/ALTER\s+TABLE\s+"GrowthPinterestPin"/i);
    expect(sql).not.toMatch(/ALTER\s+TABLE\s+"GrowthPinterestAccount"/i);
    expect(sql).not.toMatch(/ALTER\s+TABLE\s+"GrowthLearningRun"/i);
    expect(sql).not.toMatch(/ALTER\s+COLUMN\s+"(?:impressions|saves|pinClicks|outboundClicks)"\s+SET\s+NOT\s+NULL/i);
  });
});
