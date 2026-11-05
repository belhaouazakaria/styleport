import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const script = "workers/rotate-growth-autonomous-cycle-systemd.sh";
const source = readFileSync(script, "utf8");

describe("root-owned Growth intelligence SHA rotation", () => {
  it("has valid Bash syntax and refuses unreviewed root execution", () => {
    expect(() => execFileSync("bash", ["-n", script])).not.toThrow();
    expect(source).toContain("0:0:700");
    expect(source).toContain('[[ "$(id -u)" == 0 && "$#" == 2 ]] || fail');
    expect(source).toContain('[[ "$OLD" =~ ^[a-f0-9]{40}$ && "$NEW" =~ ^[a-f0-9]{40}$');
    expect(source).toContain('[[ "$(cat "$APP/.deployed-release")" == "$NEW" ]] || fail');
  });

  it("requires safely stopped intelligence and OBSERVE timers before writing", () => {
    expect(source).toContain('systemctl is-enabled "$TIMER"');
    expect(source).toContain('systemctl is-active "$TIMER"');
    expect(source).toContain('systemctl is-enabled "$OBSERVE_TIMER"');
    expect(source).toContain('systemctl is-active "$OBSERVE_TIMER"');
    expect(source).toContain('systemctl is-active --quiet "$WATCHDOG_TIMER"');
    expect(source).toContain("WATCHDOG_EXPECTED_RELEASE_SHA=$NEW");
    expect(source).toContain("EXPECTED_RELEASE=$NEW");
    expect(source).toContain("DropInPaths");
    expect(source).toContain("0:0:644");
  });

  it("changes only the service SHA, validates effective systemd and never activates", () => {
    expect(source).toContain('OnCalendar=*-*-* 04:30:00 UTC');
    expect(source).toContain('Persistent=false');
    expect(source).toContain('systemd-analyze verify');
    expect(source).toContain('systemctl daemon-reload');
    expect(source).toContain('GROWTH_CYCLE_ROTATION=READY_DISABLED');
    expect(source).not.toMatch(/systemctl\s+(?:enable|start|restart|enable --now)/);
    expect(source).not.toContain("DATABASE_URL");
    expect(source).not.toContain("GROWTH_WORKER_RUN_ENABLED=true");
  });
});
