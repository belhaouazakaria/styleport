import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.join(process.cwd(), "prisma/migrations/20261007010000_growth_translator_autopilot/migration.sql");

describe("Phase 8 migration", () => {
  it("adds decisions, immutable content versions, rollback linkage, and bounded checks", () => {
    const sql = fs.readFileSync(migrationPath, "utf8");
    expect(sql).toContain("CREATE TABLE \"GrowthDecision\"");
    expect(sql).toContain("CREATE TABLE \"GrowthContentVersion\"");
    expect(sql).toContain("TRANSLATOR_AUTOPILOT_DECIDE");
    expect(sql).toContain("TRANSLATOR_AUTOPILOT_EXECUTE");
    expect(sql).toContain("GrowthContentVersion_sourceVersionId_fkey");
    expect(sql).toContain("GrowthDecision_idempotencyKey_key");
    expect(sql).toContain('"decisionModelVersion" TEXT NOT NULL');
    expect(sql).toContain('CREATE TYPE "GrowthContentSideEffectStatus"');
    expect(sql).toContain('"sideEffectStatus" "GrowthContentSideEffectStatus" NOT NULL');
    expect(sql).not.toMatch(/DROP TABLE|DROP COLUMN|TRUNCATE/i);
  });
});
