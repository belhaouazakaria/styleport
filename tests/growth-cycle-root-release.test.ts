import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const rootRotator = readFileSync("workers/rotate-growth-watchdog-release-systemd.sh", "utf8");
const trial = readFileSync(".github/workflows/growth-cycle-one-shot-trial.yml", "utf8");
const validator = readFileSync("scripts/validate-growth-cycle-trial-request.mjs", "utf8");

describe("Phase 14I manual qualification and root release rotation", () => {
  it("only rotates the exact pinned watchdog SHA on a disabled OBSERVE host", () => {
    execFileSync("bash", ["-n", "workers/rotate-growth-watchdog-release-systemd.sh"]);
    expect(rootRotator).toContain('stat -c');
    expect(rootRotator).toContain("WATCHDOG_EXPECTED_RELEASE_SHA=$OLD");
    expect(rootRotator).toContain("WATCHDOG_EXPECTED_RELEASE_SHA=$NEW");
    expect(rootRotator).toContain('systemctl is-enabled "$OBSERVE"');
    expect(rootRotator).toContain('systemctl is-active "$OBSERVE"');
    expect(rootRotator).toContain('systemctl start "$SVC"');
    expect(rootRotator).toContain('systemctl start "$TMR"');
    expect(rootRotator).toContain("systemd-analyze verify");
    expect(rootRotator).not.toContain("systemctl enable");
    expect(rootRotator).not.toContain("systemctl start saytwist-growth-daily-observe.service");
  });
  it("requires a strict owner issue before one local-only out-of-window trial", () => {
    execFileSync("node", ["--check", "scripts/validate-growth-cycle-trial-request.mjs"]);
    expect(trial).toContain("github.event.issue.pull_request == null");
    expect(trial).toContain("github.event.sender.login == 'belhaouazakaria'");
    expect(trial).toContain("validate-growth-cycle-trial-request.mjs");
    expect(trial).toContain("GROWTH_AUTONOMOUS_CYCLE_MODE=TRIAL");
    expect(trial).toContain("growth-autonomous-cycle-launch.cjs");
    expect(validator).toContain("GROWTH_CYCLE_TRIAL_TARGET=");
    expect(trial).not.toContain("OPENAI_API_KEY");
    expect(trial).not.toContain("PINTEREST_APP_SECRET");
  });
});
