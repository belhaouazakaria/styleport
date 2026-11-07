import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const path = "workers/restore-growth-release-timers-systemd.sh";
const restore = readFileSync(path, "utf8");

describe("Phase14M protected release timer consolidation", () => {
  it("has valid shell syntax, requires a private root-owned executable and exact SHAs", () => {
    expect(() => execFileSync("bash", ["-n", path])).not.toThrow();
    expect(restore).toContain('$(id -u)');
    expect(restore).toContain('0:0:700');
    expect(restore).toContain('[[ "$OLD" =~ ^[a-f0-9]{40}$');
    expect(restore).toContain('[[ "$(cat "$APP/.deployed-release")" == "$NEW" ]]');
    expect(restore).toContain('git hash-object');
    expect(restore).toContain('bash -n "$dir/$file"');
  });
  it("rotates only the reviewed existing scripts, restores in the correct order", () => {
    for (const name of [
      "rotate-growth-watchdog-release-systemd.sh",
      "rotate-growth-daily-observe-systemd.sh",
      "rotate-growth-autonomous-cycle-systemd.sh",
      "rotate-growth-approved-publisher-release-systemd.sh",
      "rotate-growth-daily-fresh-release-systemd.sh",
    ]) expect(restore).toContain(name);
    const order = [
      'stage=WATCHDOG',
      'stage=OBSERVE',
      'stage=INTELLIGENCE',
      'stage=DAILY_RESTORE',
      'stage=PUBLISHER',
      'stage=PUBLISHER_RESTORE',
      'stage=AI_DISABLED_ROTATION',
      'stage=POSTCONDITIONS',
    ];
    let index = -1;
    for (const stage of order) {
      const next = restore.indexOf(stage, index + 1);
      expect(next).toBeGreaterThan(index);
      index = next;
    }
  });
  it("does not activate AI, perform a provider call or open a generic worker", () => {
    expect(restore).toContain('disabled "$AI"');
    expect(restore).toContain('GROWTH_AI_TIMER=DISABLED');
    expect(restore).toContain('GROWTH_DB=SAFE_OFF');
    expect(restore).not.toMatch(/systemctl (?:start|restart|enable(?: --now)?) ["']?\$AI/);
    expect(restore).not.toContain("GROWTH_AI_IMAGE_ENABLED=true");
    expect(restore).not.toContain("PINTEREST_PIN_PUBLISH");
    expect(restore).not.toContain("growth:worker");
  });
  it("fails closed on partial restore and keeps the regular site independent", () => {
    expect(restore).toContain('GROWTH_RELEASE_RESTORE=PARTIAL_STOPPED');
    expect(restore).toContain('systemctl disable --now "$PUB.timer" "$CYCLE.timer" "$OBS.timer"');
    expect(restore).toContain('workerActivationExpiresAt');
    expect(restore).toContain('attributionEnabled');
    expect(restore).toContain('GROWTH_RELEASE_RESTORE=PASSED');
    expect(restore).toContain('https://saytwist.com/api/readyz');
  });
});
