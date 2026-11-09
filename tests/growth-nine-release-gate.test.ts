import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const hold = readFileSync("workers/coordinate-growth-nine-timer-release.sh", "utf8");
const migrate = readFileSync("scripts/growth-viral-production-migration.cjs", "utf8");
const stage = readFileSync(".github/workflows/growth-nine-release-stage.yml", "utf8");

describe("Protected nine-timer release", () => {
  it("parses scripts and pins precisely the nine existing approved schedules", () => {
    execFileSync("bash", ["-n", "workers/coordinate-growth-nine-timer-release.sh"]);
    execFileSync("node", ["--check", "scripts/growth-viral-production-migration.cjs"]);
    for (const name of [
      "lease-watchdog", "daily-observe", "autonomous-cycle",
      "approved-publisher", "daily-fresh", "private-report",
      "autonomous-content", "daily-account-analytics", "auto-translator-publish",
    ]) {
      expect(hold).toContain(name);
      expect(migrate).toContain('"' + name + '"');
    }
    expect(hold).toContain("a73ed6a4d4a5d3244fe5735bd7f027aa8a6d81ff");
    expect(hold).toContain("0:0:700");
    expect(hold).toContain("DropInPaths");
    expect(hold).toContain("Persistent=$persist");
    expect(hold).toContain("GROWTH_PRIVATE_REPORT_APPROVAL");
  });

  it("requires separate hold, recover, restore approvals and restores watchdog first", () => {
    expect(hold).toContain('"HOLD:$OLD:$NEW"');
    expect(hold).toContain('"RECOVER:$OLD:$NEW"');
    expect(hold).toContain('"RESTORE:$OLD:$NEW"');
    expect(hold).toContain('systemctl disable --now "${TIMERS[@]}"');
    expect(hold).toContain("systemctl start saytwist-growth-lease-watchdog.service");
    expect(hold).toContain("systemctl enable --now saytwist-growth-lease-watchdog.timer");
    expect(hold).toContain('systemctl enable --now "${OTHERS[@]}"');
    expect(hold).toContain("PARTIAL_RECOVERY_OPERATOR_REQUIRED");
    expect(hold).toContain("RECOVER_STARTED=1");
    expect(hold).toContain("RECOVER_STARTED=0");
    expect(hold).toContain("systemd-analyze verify");
    expect(hold).toContain("GROWTH_NINE_RESTORE=PASSED");
    expect(hold).toContain('"$(count_migrations saytwist)" == 33');
    expect(hold).toContain('"$(count_migrations saytwist)" == 35');
    expect(hold).not.toContain("install-growth-viral-source");
  });

  it("guards production migration with fresh backup and fully qualified 35-migration clone", () => {
    expect(migrate).toContain("viral-nine-release-source/");
    expect(migrate).toContain("GROWTH_VIRAL_PRODUCTION_MIGRATION_APPROVAL");
    expect(migrate).toContain('"APPLY_VIRAL_2:" + sha');
    expect(migrate).toContain("process.execPath === NODE");
    expect(migrate).toContain("timerHold();");
    expect(migrate).toContain("prod.length === 33 && clone.length === 35");
    expect(migrate).toContain("same(prod,clone.slice(0,33))");
    expect(migrate).toContain("backup(url,sha)");
    expect(migrate).toContain("process.umask(0o077)");
    expect(migrate).toContain('"migrate","deploy"');
    expect(migrate).toContain("VIRAL_PRODUCTION_TWO_MIGRATIONS_APPLIED=true");
    expect(migrate).not.toContain("systemctl enable");
    expect(migrate).not.toContain("createPinterestPin");
  });

  it("stages sources only from manually approved exact SHA on main", () => {
    expect(stage).toContain("workflow_dispatch:");
    expect(stage).toContain("github.actor == 'belhaouazakaria'");
    expect(stage).toContain("inputs.release_sha == github.sha");
    expect(stage).toContain("persist-credentials: false");
    expect(stage).toContain("GROWTH_NINE_RELEASE_SOURCE_STAGED=true");
    expect(stage).toContain('test ! -e "$DIR"');
    expect(stage).not.toContain("issue_comment:");
    expect(stage).not.toContain("systemctl");
    expect(stage).not.toContain("migrate deploy");
  });
});
