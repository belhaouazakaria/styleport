import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.join(process.cwd(), "prisma/migrations/20261006010000_growth_pinterest_relevance/migration.sql");

describe("Growth Phase 4 relevance migration", () => {
  it("adds only owned domains, eligibility, and the selection index", () => {
    const sql = readFileSync(migrationPath, "utf8");
    expect(sql).toContain('ADD COLUMN "ownedDomains" TEXT[]');
    expect(sql).toContain('ADD COLUMN "analyticsEligible" BOOLEAN');
    expect(sql).toContain("saytwist.com");
    expect(sql).toContain("translator.whattypeof.com");
    expect(sql).toContain("accountId_isActive_analyticsEligible_lastAnalyticsSyncAt_idx");
    expect(sql).not.toMatch(/DROP\s+(TABLE|COLUMN|TYPE)|DELETE\s+FROM/i);
  });
});
