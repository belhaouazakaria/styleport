import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync("app/api/admin/growth/viral/route.ts", "utf8");
const store = readFileSync("lib/growth/viral/store.ts", "utf8");
const analytics = readFileSync("lib/growth/viral/analytics.ts", "utf8");
const migration = readFileSync(
  "prisma/migrations/20261109180000_growth_viral_intelligence_foundation/migration.sql",
  "utf8",
);
const schema = readFileSync("prisma/schema.prisma", "utf8");
const catalog = readFileSync("lib/growth/viral/catalog.ts", "utf8");

describe("Viral Growth opt-in and security boundaries", () => {
  it("uses administrative authorization and same-origin for each mutating route", () => {
    expect(route).toContain("adminRouteGuard()");
    expect(route).toContain("isSameOriginMutation(request)");
    expect(route).toContain("getSessionOrNull()");
    expect(route).toContain("viralPortfolioPolicySchema.safeParse(body)");
    expect(route).toContain('fields.join(",") === "action"');
    expect(route).not.toContain("createPinterestPin");
    expect(route).not.toContain("updatePinterestPin");
  });

  it("never starts a live timer or modifies the existing Growth kill switch", () => {
    expect(store).toContain("VIRAL_SOURCE_OWNER_PAUSED");
    expect(store).toContain("CATALOG_SCAN_RESERVED");
    expect(store).toContain("VIRAL_SOURCE_ALREADY_SCANNED_TODAY");
    expect(store).not.toContain("systemctl");
    expect(store).not.toContain("growthSettings.update");
    expect(store).not.toContain("createPinterestPin");
    expect(analytics).not.toContain("createPinterestPin");
    expect(analytics).not.toContain("updatePinterestPin");
    expect(analytics).toContain("OFFICIAL_SAVED_OWNED_PIN_ANALYTICS");
    expect(catalog).toContain('redirect: "manual"');
    expect(catalog).toContain("VIRAL_CATALOG_ROBOTS_DISALLOW");
  });

  it("has explicit paused defaults, immutable destinations and append-only metrics", () => {
    expect(schema).toContain("model GrowthViralProgramSettings");
    expect(schema).toContain("model GrowthViralConcept");
    expect(schema).toContain("model GrowthViralPinTest");
    expect(schema).toContain("model GrowthViralMetricObservation");
    expect(schema).toContain("model GrowthViralNicheProposal");
    expect(migration).toContain("VALUES ('global','PAUSED',50,3)");
    expect(migration).toContain('CREATE TRIGGER "growth_viral_pin_immutable_destination"');
    expect(migration).toContain('OLD."destinationUrl" IS DISTINCT FROM NEW."destinationUrl"');
    expect(migration).toContain('CREATE TRIGGER "growth_viral_metric_no_update_delete"');
    expect(migration).toContain("TRACKED");
    expect(migration).not.toContain("ALTER TABLE \"GrowthSettings\"");
    expect(migration).not.toContain("DELETE FROM \"GrowthPinterestPin\"");
  });
});
