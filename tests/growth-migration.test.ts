import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = path.join(
  process.cwd(),
  "prisma/migrations/20261005140000_growth_platform_foundation/migration.sql",
);

describe("Growth foundation migration", () => {
  it("is additive and limited to the accepted Phase 2 tables", () => {
    const sql = readFileSync(migrationPath, "utf8");
    for (const table of ["GrowthSettings", "GrowthJob", "GrowthActivity", "GrowthWorkerHeartbeat"]) {
      expect(sql).toContain(`CREATE TABLE "${table}"`);
    }
    expect(sql).not.toMatch(/DROP\s+(TABLE|COLUMN|TYPE)/i);
    expect(sql).not.toMatch(/Pinterest|Attribution|GrowthIdea|GrowthPin/i);
  });

  it("contains the job eligibility and idempotency indexes plus bounded checks", () => {
    const sql = readFileSync(migrationPath, "utf8");
    expect(sql).toContain("GrowthJob_idempotencyKey_key");
    expect(sql).toContain("GrowthJob_status_runAfter_idx");
    expect(sql).toContain("GrowthJob_leaseUntil_idx");
    expect(sql).toContain("GrowthJob_maxAttempts_check");
    expect(sql).toContain("GrowthSettings_workerBatchSize_check");
  });
});
