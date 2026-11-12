import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const coordinator = path.join(process.cwd(), "workers/coordinate-growth-twelve-timer-evidence-release.sh");
const script = readFileSync(coordinator, "utf8");

describe("protected 12-timer release coordinator", () => {
  it("parses as Bash without executing services", () => {
    expect(() => execFileSync("bash", ["-n", coordinator])).not.toThrow();
  });

  it("pins the old deployed SHA and requires a root-owned isolated copy", () => {
    expect(script).toContain("924134f2947150d3bf3bba064dd296fc17b2071b");
    expect(script).toContain('$(id -u)');
    expect(script).toContain("0:0:700");
    expect(script).toContain("GROWTH_TWELVE_RELEASE_APPROVAL");
    expect(script).toContain("HOLD:$OLD:$NEW");
    expect(script).toContain("RESTORE:%s:%s");
    expect(script).toContain("RECOVER:%s:%s");
  });

  it("holds all twelve existing timers before deployment and resumes none on audit", () => {
    for (const name of [
      "lease-watchdog", "daily-observe", "autonomous-cycle", "approved-publisher",
      "daily-fresh", "private-report", "autonomous-content",
      "daily-account-analytics", "auto-translator-publish",
      "viral-discovery", "viral-source", "pin-maintenance",
    ]) {
      expect(script).toContain(name);
    }
    expect(script).toContain("systemctl disable --now $TIMERS");
    expect(script).toContain("systemctl enable --now $TIMERS");
    expect(script).toContain("check_timers disabled");
  });

  it("checks immutable safe-off policy, empty queue, and releasable app identity", () => {
    expect(script).toContain('"workerActivationExpiresAt" IS NULL');
    expect(script).toContain("NOT EXISTS(SELECT 1 FROM \"GrowthJob\"");
    expect(script).toContain("sourceSharePercent");
    expect(script).toContain("maxPinsPerDay");
    expect(script).toContain("count_migrations");
    expect(script).toContain(".deployed-release");
    expect(script).toContain("127.0.0.1:3001/api/readyz");
  });

  it("rotates the separate approvals as well as release pins, without broad workers", () => {
    expect(script).toContain("SAYTWIST_PRIVATE_DAILY_REPORT:");
    expect(script).toContain("SAYTWIST_VIRAL_DISCOVERY:");
    expect(script).toContain("SAYTWIST_VIRAL_SOURCE:");
    expect(script).toContain("SAYTWIST_PIN_MAINTENANCE:");
    expect(script).toContain("check_units \"$NEW\"");
    expect(script).toContain("GROWTH_TWELVE_RESTORE=PASSED");
    expect(script).not.toContain("pm2 start");
    expect(script).not.toContain("GROWTH_WORKER_RUN_ENABLED=true");
  });
});
