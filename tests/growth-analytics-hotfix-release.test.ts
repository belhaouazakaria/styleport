import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const path = "workers/coordinate-growth-eleven-analytics-fix-release.sh";
const script = readFileSync(path, "utf8");
const oldSha = "103fb7324b277cbea63bb200e32247636db10a79";
const newSha = "104b3597e58178190f0d1aace7137001fb8b4458";

describe("one-time 11-timer Growth analytics hotfix release", () => {
  it("parses as valid Bash", () => {
    expect(() => execFileSync("bash", ["-n", path])).not.toThrow();
  });
  it("pins exact deployed and target releases, including previous audit trail", () => {
    expect(script).toContain('[[ "$OLD" == ' + oldSha + ' && "$NEW" == ' + newSha + ' ]] || fail');
    expect(script).toContain("STATE=/etc/saytwist-growth-eleven-analytics-fix-release-state");
    expect(script).toContain("PREVIOUS=/etc/saytwist-growth-eleven-queued-sync-release-state");
    expect(script).toContain("status=RESTORED");
    expect(script).toContain("status=HELD");
    expect(script).not.toContain("quiet_window");
    expect(script).not.toContain("date -u +%H");
  });
  it("audits and preserves every existing timer, owner permissions and fixed approval", () => {
    expect(script).toContain("viral-discovery viral-source");
    expect(script).toContain("GROWTH_PRIVATE_REPORT_APPROVAL");
    expect(script).toContain("GROWTH_VIRAL_DISCOVERY_OWNER_APPROVAL");
    expect(script).toContain("GROWTH_VIRAL_SOURCE_OWNER_APPROVAL");
    expect(script).toContain("SOURCE_ENV=/etc/saytwist-growth-viral-source-approval.env");
    expect(script).toContain("OnCalendar=${CALENDARS[$i]}");
    expect(script).toContain("systemctl daemon-reload");
    expect(script).toContain("GROWTH_ELEVEN_HOLD=PASSED");
    expect(script).toContain("GROWTH_ELEVEN_RESTORE=PASSED");
    expect(script).toContain("GROWTH_ELEVEN_RECOVER_OLD=PASSED");
    expect(script).toContain('GROWTH_ELEVEN_RELEASE_SHA=$NEW');
    expect(script).toContain("== 35");
    expect(script).not.toContain("systemctl restart");
    expect(script).not.toContain("GROWTH_WORKER_RUN_ENABLED=true");
  });
  it("does not silently run queued work or change publisher permissions", () => {
    expect(script).toContain("safe_db");
    expect(script).toContain('count(*) <= 2');
    expect(script).toContain("GROWTH_ELEVEN_DB_GATE=SAFE_OFF_BEFORE_RESUME");
    expect(script).toContain('mode=\'ACTIVE\'');
    expect(script).toContain('\\"sourceSharePercent\\"=50');
    expect(script).toContain('\\"maxPinsPerDay\\"=5');
    expect(script).not.toContain("npm run");
    expect(script).not.toContain("npx ");
  });
});