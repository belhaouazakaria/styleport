import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("scripts/hostinger-prepare-growth-daily-plan-migration.sh", "utf8");
const deploy = readFileSync(".github/workflows/deploy-hostinger.yml", "utf8");
const qualification = readFileSync("scripts/qualify-growth-cadence-sql.sh", "utf8");
const coordinator = readFileSync("workers/coordinate-growth-daily-plan-release.py", "utf8");

describe("daily Growth plan production migration gate", () => {
  it("pins the old and target releases, exact single migration, private bundle and backup", () => {
    expect(migration).toContain('OLD_RELEASE_SHA="610b55e0ee0a36ce2ba67245dc34ed8d195030b2"');
    expect(migration).toContain('APPROVED_MIGRATION="20261119090000_growth_daily_plan_targets"');
    expect(migration).toContain('[[ "$APPROVAL" == "APPLY $APPROVED_MIGRATION" ]]');
    expect(migration).toContain('/home/saytwist/.local/share/saytwist/growth-daily-plan/$RELEASE_SHA');
    expect(migration).toContain('/home/saytwist/.local/share/saytwist/growth-daily-plan-migrations');
    expect(migration).toContain('applied.length===41');
    expect(migration).toContain('names.length!==42||names[41]!==expected');
    expect(migration).toContain('status IN ($1,$2,$3)');
    expect(migration).toContain('WHERE id=$1');
    expect(migration).toContain('WHERE status=$1 ORDER BY id');
    expect(migration).toContain("PENDING_QUEUE_SHA256=");
    expect(migration).toContain('SELECT id FROM "GrowthDailyCadencePreference" WHERE id=$1');
    expect(migration).toContain('[[ "$pending_after" == "$pending_before" ]]');
    expect(migration).toContain('migrate deploy --schema');
    expect(migration).toContain('POST_MIGRATION_SCHEMA');
  });

  it("runs the exact migration after verified artifact fetch and before the application deployment", () => {
    const fetchIndex = deploy.indexOf("bash ./scripts/hostinger-fetch-release.sh");
    const migrationIndex = deploy.indexOf("bash ./scripts/hostinger-prepare-growth-daily-plan-migration.sh");
    const deployIndex = deploy.indexOf("bash ./scripts/hostinger-deploy.sh");
    expect(fetchIndex).toBeGreaterThan(-1);
    expect(migrationIndex).toBeGreaterThan(fetchIndex);
    expect(deployIndex).toBeGreaterThan(migrationIndex);
    expect(deploy).toContain('HOSTINGER_MIGRATION_APPROVAL="APPLY 20261119090000_growth_daily_plan_targets"');
  });

  it("qualifies the new SQL after the existing cadence table and preserves custom image caps", () => {
    expect(qualification).toContain('20261119090000_growth_daily_plan_targets/migration.sql');
    expect(qualification).toContain("INVALID_DEFAULT_DAILY_PLAN");
    expect(qualification).toContain("INVALID_IMAGE_CAP_MIGRATION");
    expect(qualification).toContain("newTranslatorPins");
    expect(qualification).toContain("anythingTranslatePins");
  });

  it("preserves scheduled pending pins while keeping the lease watchdog active", () => {
    expect(coordinator).toContain("WORK_TIMERS = [timer for timer in TIMERS if timer != \"saytwist-growth-lease-watchdog.timer\"]");
    expect(coordinator).toContain("pendingQueueSha256");
    expect(coordinator).toContain("PENDING_QUEUE_CHANGED_DURING_DEPLOY");
    expect(coordinator).toContain("WATCHDOG_NOT_ACTIVE_AND_ENABLED");
    expect(coordinator).toContain("PENDING_QUEUE_CHANGED_DURING_HOLD");
  });
});
