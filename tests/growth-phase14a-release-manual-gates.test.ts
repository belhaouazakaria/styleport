import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const deploy = readFileSync(".github/workflows/deploy-hostinger.yml", "utf8");
const staging = readFileSync(
  ".github/workflows/growth-phase14k-cadence-clone-stage.yml", "utf8",
);
const migrator = readFileSync(
  "scripts/hostinger-prepare-growth-cadence-migration.sh", "utf8",
);
const rehearsal = readFileSync(
  "scripts/growth-phase14k-cadence-clone-rehearsal.cjs", "utf8",
);
const verifier = readFileSync(
  "scripts/growth-phase14k-verify-clone.cjs", "utf8",
);

describe("Phase A release is manual, exact-SHA and migration-gated", () => {
  it("never automatically deploys a PR merge to main", () => {
    const header = deploy.split("\njobs:")[0];
    expect(header).toContain("workflow_dispatch:");
    expect(header).not.toMatch(/^\s+push:\s*$/m);
    expect(deploy).toContain("expected_release_sha");
    expect(deploy).toContain('"$EXPECTED_RELEASE_SHA" != "$GITHUB_SHA"');
    expect(deploy).toContain('HOSTINGER_EXPECT_NO_PENDING_MIGRATIONS="1"');
  });
  it("only runs clone source staging with owner issue approval and matching SHA", () => {
    expect(staging).toContain("github.event.sender.login == 'belhaouazakaria'");
    expect(staging).toContain("authorize-growth-phase14k-cadence-stage.mjs");
    expect(staging).toContain("gh api");
    expect(staging).toContain("GROWTH_PHASE14K_RELEASE_SHA=");
    expect(staging).toContain("scripts/growth-phase14k-cadence-clone-rehearsal.cjs");
    expect(staging).not.toContain("prisma migrate deploy --schema");
  });
  it("migration script requires clone proof, backup, and Growth OFF", () => {
    expect(() => execFileSync("bash", [
      "-n", "scripts/hostinger-prepare-growth-cadence-migration.sh",
    ])).not.toThrow();
    for (const key of [
      "20261105150000_growth_daily_cadence_controls",
      "validate_exact_pending_migration",
      "validate_clone_rehearsal",
      "validate_growth_off",
      "create_verified_backup",
      "resolve_runtime_environment",
      '"$(id -un)" == "saytwist"',
      "phase14k-rehearsal",
    ]) expect(migrator).toContain(key);
    expect(migrator).not.toContain(
      'APPROVED_MIGRATION="20261029220000_growth_worker_activation_expiry"',
    );
  });
  it("strict clone-only scripts syntax check and never target production for mutation", () => {
    for (const name of [
      "scripts/growth-phase14k-cadence-clone-rehearsal.cjs",
      "scripts/growth-phase14k-verify-clone.cjs",
      "scripts/authorize-growth-phase14k-cadence-stage.mjs",
    ]) expect(() => execFileSync("node", ["--check", name])).not.toThrow();
    expect(rehearsal).toContain('const CLONE = "saytwist_phase14k_rehearsal_20261105"');
    expect(rehearsal).toContain("same(beforeProd, beforeClone)");
    expect(rehearsal).toContain("same(history(url, PROD), beforeProd)");
    expect(rehearsal).toContain('cloneUrl.pathname = "/" + CLONE');
    expect(rehearsal).toContain("afterClone.length === 33");
    expect(verifier).toContain("GrowthDailyCadencePreference");
  });
});
