import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const service = readFileSync("workers/install-growth-autonomous-cycle-systemd.sh", "utf8");
const launcher = readFileSync("workers/growth-autonomous-cycle-launch.cjs", "utf8");
const runner = readFileSync("workers/growth-autonomous-cycle.ts", "utf8");
const alert = readFileSync("workers/growth-autonomous-cycle-alert.cjs", "utf8");

describe("autonomous Growth cycle host boundary", () => {
  it("installs a disabled-only bounded systemd timer with its private alert", () => {
    execFileSync("bash", ["-n", "workers/install-growth-autonomous-cycle-systemd.sh"]);
    expect(service).toContain("OnCalendar=*-*-* 04:30:00 UTC");
    expect(service).toContain("Persistent=false");
    expect(service).toContain("OnFailure=$ALERT");
    expect(service).toContain("TimeoutStartSec=450");
    expect(service).toContain('stat -c');
    expect(service).not.toContain("systemctl enable");
    expect(service).not.toContain("systemctl start");
  });
  it("pins the current release, watchdog and OBSERVE before any database work", () => {
    execFileSync("node", ["--check", "workers/growth-autonomous-cycle-launch.cjs"]);
    execFileSync("node", ["--check", "workers/growth-autonomous-cycle-alert.cjs"]);
    expect(launcher).toContain("WATCHDOG_EXPECTED_RELEASE_SHA=");
    expect(launcher).toContain("saytwist-growth-daily-observe.timer");
    expect(launcher).toContain("validatedDatabaseUrl(rows)");
    expect(launcher).toContain("GROWTH_AUTONOMOUS_CYCLE_ENTRYPOINT");
    expect(launcher).not.toContain("PINTEREST_APP_SECRET");
    expect(launcher).not.toContain("BREVO_API_KEY");
    expect(launcher).not.toContain("OPENAI_API_KEY");
  });
  it("uses one-specific job leases and never queues a publish or AI task", () => {
    expect(runner).toContain("onlyJobId: jobId");
    expect(runner).toContain("maxAttempts: 1");
    expect(runner).toContain("revokeGrowthWorkerActivation(deadline)");
    expect(runner).toContain("GrowthJobStatus.SUCCEEDED");
    expect(runner).not.toContain("GrowthJobType.PINTEREST_PIN_PUBLISH");
    expect(runner).not.toContain("GrowthJobType.CREATIVE_LAB_GENERATE");
    expect(alert).toContain("GROWTH_AUTONOMOUS_CYCLE_ALERT_ENABLED");
    expect(alert).toContain("COOLDOWN_MS = 24 * 60 * 60 * 1000");
  });
});
