// @vitest-environment node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const release = readFileSync("workers/coordinate-growth-v2-release.sh", "utf8");
const migration = readFileSync(
  "scripts/hostinger-prepare-growth-v2-migrations.sh",
  "utf8",
);
describe("Growth V2 protected release", () => {
  it("parses all new shell/launchers without executing a live action", () => {
    for (const file of [
      "workers/coordinate-growth-v2-release.sh",
      "scripts/hostinger-prepare-growth-v2-migrations.sh",
      "workers/install-growth-v2-systemd.sh",
      "scripts/test-growth-v2-db.sh",
    ])
      expect(() => execFileSync("bash", ["-n", file])).not.toThrow();
    expect(() =>
      execFileSync("node", ["--check", "workers/growth-v2-launch.cjs"]),
    ).not.toThrow();
  });
  it("pins the actual known release and all four exact additive migrations", () => {
    for (const script of [release, migration])
      expect(script).toContain("a5d93f7e50a87007e046dbac34976b46304b98a9");
    for (const name of [
      "20261115120000_growth_unified_approvals",
      "20261115130000_growth_intelligence_coverage",
      "20261115140000_growth_viral_evidence_windows",
      "20261115150000_growth_google_analytics",
    ]) {
      expect(release).toContain(name);
      expect(migration).toContain(name);
    }
    expect(release).toContain('audit|hold) [[ "$MIGRATIONS" == 36 ]]');
    expect(release).toContain('restore) [[ "$MIGRATIONS" == 40 ]]');
    expect(release).toMatch(/migration_name IN[^\n]+== 4/);
    expect(migration).toContain('"$db_names" == "$source_names"');
    expect(release).toContain('NOT EXISTS(SELECT 1 FROM "GrowthJob"');
  });
  it("requires protected root copies, owner approvals and a held timer state", () => {
    for (const script of [release, migration])
      expect(script).toContain("0:0:700");
    expect(migration).toContain('"APPLY $APPROVED_MIGRATION"');
    expect(migration).toContain("status=HELD");
    expect(migration).toContain("create_verified_backup");
    expect(migration).not.toContain("migrate reset");
    expect(release).toContain("systemctl disable --now $TIMERS");
    expect(release).toContain("systemctl enable --now $TIMERS");
  });
});
