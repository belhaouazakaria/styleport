import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migration = fs.readFileSync(
  path.join(
    process.cwd(),
    "prisma/migrations/20261015120000_growth_evergreen_learning/migration.sql",
  ),
  "utf8",
);

describe("Phase 12 additive migration", () => {
  it("adds immutable runs, recommendations, learned windows, and experiment evaluations", () => {
    expect(migration).toContain('CREATE TABLE "GrowthLearningRun"');
    expect(migration).toContain(
      'CREATE TABLE "GrowthEvergreenRecommendationRecord"',
    );
    expect(migration).toContain('CREATE TABLE "GrowthLearnedScheduleWindow"');
    expect(migration).toContain(
      'CREATE TABLE "GrowthExperimentLearningEvaluation"',
    );
    expect(migration).toContain(
      "GrowthEvergreenRecommendationRecord_target_check",
    );
    expect(migration).toContain('ADD COLUMN "evergreenCooldownDays"');
    expect(migration).toContain("GrowthSettings_evergreenCooldownDays_check");
    expect(migration).toContain(
      '"GrowthEvergreenRecommendationRecord_run_translator_key"',
    );
    expect(migration).toContain('WHERE "translatorId" IS NOT NULL');
    expect(migration).toContain(
      '"GrowthEvergreenRecommendationRecord_run_idea_key"',
    );
    expect(migration).toContain('WHERE "ideaId" IS NOT NULL');
    expect(migration).not.toContain(
      'ON "GrowthEvergreenRecommendationRecord"("learningRunId", "destinationKind", "translatorId", "ideaId")',
    );
    expect(migration).toMatch(/translatorId_fkey[\s\S]*ON DELETE RESTRICT/);
    expect(migration).toMatch(/ideaId_fkey[\s\S]*ON DELETE RESTRICT/);
    expect(migration).not.toMatch(/DROP TABLE|DROP COLUMN|migrate reset/i);
  });
});
