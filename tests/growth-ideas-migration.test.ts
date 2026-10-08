import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.join(process.cwd(), "prisma/migrations/20261007140000_growth_ideas/migration.sql");

describe("Phase 9 migration", () => {
  it("adds separate taxonomy, Ideas, immutable versions, references, and safe deterministic seeds", () => {
    const sql = fs.readFileSync(migrationPath, "utf8");
    expect(sql).toContain('CREATE TABLE "GrowthIdeaCategory"');
    expect(sql).toContain('CREATE TABLE "GrowthIdea"');
    expect(sql).toContain('CREATE TABLE "GrowthIdeaVersion"');
    expect(sql).toContain('CREATE TABLE "GrowthIdeaTranslatorReference"');
    expect(sql).toContain("IDEA_AUTOPILOT_DECIDE");
    expect(sql).toContain("IDEA_AUTOPILOT_EXECUTE");
    expect(sql).toContain("CREATE_IDEA");
    expect(sql).toContain("IMPROVE_IDEA");
    expect(sql).toContain('ON CONFLICT ("slug") DO NOTHING');
    expect(sql).not.toMatch(/DROP TABLE|DROP COLUMN|TRUNCATE/i);
  });
});

