import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  ".github/workflows/growth-cycle-one-shot-trial.yml", "utf8",
);
const remote = source.split("          script: |\n")[1];

describe("Phase14I owner-gated SSH trial workflow", () => {
  it("preserves owner, exact SHA, approval and restricted production gates", () => {
    expect(source).toContain("github.event.sender.login == 'belhaouazakaria'");
    expect(source).toContain("Validate exact owner, issue, comment and commit SHA");
    expect(source).toContain("Refuse main advancing after owner approval");
    expect(source).toContain("script_stop: true");
    expect(source).toContain("environment: production");
    expect(remote).toContain("            set -eu\n");
    expect(remote).toContain('test "$(id -un)" = "saytwist"');
    expect(remote).toContain('test "$(cat .deployed-release)" = "$EXPECTED_RELEASE"');
    expect(remote).toContain("saytwist-growth-lease-watchdog.timer");
    expect(remote).toContain("saytwist-growth-daily-observe.timer");
  });

  it("does not split remote pipes or environment invocation across lines", () => {
    expect(remote).toBeDefined();
    expect(remote).not.toMatch(/\\\s*$/m);
    expect(remote).not.toMatch(/\|\s*$/m);
    expect(remote).toContain(
      'env EXPECTED_RELEASE="$EXPECTED_RELEASE" GROWTH_AUTONOMOUS_CYCLE_LAUNCH=true GROWTH_AUTONOMOUS_CYCLE_MODE=TRIAL ',
    );
    expect(remote).toContain(
      "workers/growth-autonomous-cycle-launch.cjs",
    );
    expect(remote).not.toContain("GROWTH_WORKER_RUN_ENABLED=true");
  });
});
