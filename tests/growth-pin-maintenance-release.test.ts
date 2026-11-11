import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const path = "workers/coordinate-growth-eleven-pin-maintenance-release.sh";
const script = readFileSync(path, "utf8");
const OLD = "104b3597e58178190f0d1aace7137001fb8b4458";
const NEW = "fc3ec602b6fbaad4d3afbedca840c3f2c43521c2";
describe("exact-SHA 11-timer release for disabled 12th maintenance feature", () => {
  it("has valid Bash syntax", () => {
    expect(() => execFileSync("bash", ["-n", path])).not.toThrow();
  });
  it("pins old/new SHAs and verifies last restored release independently", () => {
    expect(script).toContain('[[ "$OLD" == ' + OLD + ' && "$NEW" == ' + NEW + ' ]] || fail');
    expect(script).toContain("STATE=/etc/saytwist-growth-eleven-pin-maintenance-release-state");
    expect(script).toContain("PREVIOUS=/etc/saytwist-growth-eleven-analytics-fix-release-state");
    expect(script).toContain("status=RESTORED");
    expect(script).toContain("status=HELD");
    expect(script).toContain("35");
  });
  it("preserves all previously enabled schedules and does not activate the 12th", () => {
    expect(script).toContain("viral-discovery viral-source");
    expect(script).toContain("GROWTH_PRIVATE_REPORT_APPROVAL");
    expect(script).toContain("GROWTH_VIRAL_DISCOVERY_OWNER_APPROVAL");
    expect(script).toContain("GROWTH_VIRAL_SOURCE_OWNER_APPROVAL");
    expect(script).toContain("GROWTH_ELEVEN_AUDIT=PASSED");
    expect(script).toContain("GROWTH_ELEVEN_HOLD=PASSED");
    expect(script).toContain("GROWTH_ELEVEN_RESTORE=PASSED");
    expect(script).toContain("GROWTH_ELEVEN_RECOVER_OLD=PASSED");
    expect(script).toContain("saytwist-growth-pin-maintenance.timer");
    expect(script).not.toContain("systemctl restart");
    expect(script).not.toContain("systemctl enable --now saytwist-growth-pin-maintenance");
    expect(script).not.toContain("GROWTH_WORKER_RUN_ENABLED=true");
    expect(script).not.toContain("quiet_window");
    expect(script).not.toContain("date -u +%H");
  });
  it("requires controlled Growth, publisher approvals, empty or narrowly scoped queue", () => {
    expect(script).toContain("safe_db");
    expect(script).toContain("workerActivationExpiresAt");
    expect(script).toContain("GROWTH_ELEVEN_DB_GATE=SAFE_OFF_BEFORE_RESUME");
    expect(script).toContain("SOURCE_ENV=/etc/saytwist-growth-viral-source-approval.env");
    expect(script).toContain('GROWTH_ELEVEN_RELEASE_SHA=$NEW');
  });
});