import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "prisma/migrations/20261006190000_growth_account_strategy/migration.sql",
  "utf8",
);

describe("Growth Phase 6 migration", () => {
  it("is additive, canonical, bounded, and does not synthesize historical strategy", () => {
    expect(migration).toContain("ACCOUNT_STRATEGY_REVIEW");
    expect(migration).toContain('CREATE TABLE "GrowthAccountStrategyReview"');
    expect(migration).toContain(
      'UNIQUE INDEX "GrowthAccountStrategyReview_reviewMonth_modelVersion_key"',
    );
    expect(migration).toContain('CHECK ("confidence" BETWEEN 0 AND 100)');
    expect(migration).not.toMatch(
      /DROP TABLE|DROP COLUMN|DELETE FROM|INSERT INTO "GrowthAccountStrategyReview"/i,
    );
    expect(migration).not.toMatch(
      /ALTER TABLE "(?:TranslationLog|GrowthPinterestAccount|GrowthPinterestBoard|GrowthPinterestPin|GrowthAttribution)/,
    );
  });
});
