import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const install = readFileSync("workers/install-growth-approved-publisher-systemd.sh", "utf8");
const launch = readFileSync("workers/growth-approved-publisher-launch.cjs", "utf8");
const publisher = readFileSync("workers/growth-approved-publisher.ts", "utf8");
const alert = readFileSync("workers/growth-approved-publisher-alert.cjs", "utf8");
const rotation = readFileSync("workers/rotate-growth-approved-publisher-release-systemd.sh", "utf8");

describe("Phase14L guarded disabled-by-default publisher installation", () => {
  it("has valid shell syntax and installs but never enables the timer", () => {
    expect(() => execFileSync("bash", ["-n", "workers/install-growth-approved-publisher-systemd.sh"]))
      .not.toThrow();
    expect(install).toContain('[[ "$(id -u)" == 0');
    expect(install).toContain("0:0:700");
    expect(install).toContain("0:0:600");
    expect(install).toContain("OnCalendar=*-*-* *:00/5:00 UTC");
    expect(install).toContain("Persistent=false");
    expect(install).toContain("User=saytwist");
    expect(install).toContain("OnFailure=$ALERT");
    expect(install).toContain("NoNewPrivileges=true");
    expect(install).toContain("GROWTH_APPROVED_PUBLISHER_INSTALL=INSTALLED_DISABLED");
    expect(install).not.toMatch(/\bsystemctl\s+(?:enable|start|restart)\s+[^\n]*approved-publisher/);
  });
  it("requires a verified release, independent watchdog and isolated PM2 credentials", () => {
    expect(launch).toContain("validatedDatabaseUrl");
    expect(launch).toContain("loadPinterestRuntimeEnv");
    expect(launch).toContain("WATCHDOG_EXPECTED_RELEASE_SHA=");
    expect(launch).toContain("GROWTH_APPROVED_PUBLISHER_LAUNCH");
    expect(launch).toContain("GROWTH_WORKER_RUN_ENABLED: \"false\"");
    expect(launch).toContain("GROWTH_ROLLOUT_MODE: \"OFF\"");
    expect(launch).toContain("GROWTH_AI_IMAGE_ENABLED: \"false\"");
    expect(launch).toContain("GROWTH_APPROVED_PUBLISHER_LAUNCH=BLOCKED");
    expect(launch).not.toContain("console.log(db)");
  });
  it("enforces one exact approved job, bounded activation and terminal-safe errors", () => {
    expect(publisher).toContain("jobId: scope");
    expect(publisher).toContain("allowedTypes: [GrowthJobType.PINTEREST_PIN_PUBLISH]");
    expect(publisher).toContain("PUBLISHER_FRESH_CANDIDATE_AFTER");
    expect(publisher).toContain("LEASE_MS = 180_000");
    expect(publisher).toContain("await revokeGrowthWorkerActivation(expires)");
    expect(publisher).toContain("await failGrowthJob(job, workerId, error)");
    expect(publisher).toContain("GrowthPublicationStatus.RECONCILING");
    expect(publisher).not.toContain("PINTEREST_PIN_RECONCILE],");
  });
  it("rotates publisher SHA only after legacy timers, keeping the publisher disabled", () => {
    expect(() => execFileSync("bash", ["-n", "workers/rotate-growth-approved-publisher-release-systemd.sh"]))
      .not.toThrow();
    expect(rotation).toContain("0:0:700");
    expect(rotation).toContain("0:0:644");
    expect(rotation).toContain("WATCHDOG_EXPECTED_RELEASE_SHA=$NEW");
    expect(rotation).toContain('[[ "$(cat "$APP/.deployed-release")" == "$NEW" ]]');
    expect(rotation).toContain("OnCalendar=*-*-* *:00/5:00 UTC");
    expect(rotation).toContain("APPROVED_PUBLISHER_ROTATION=READY_DISABLED");
    expect(rotation).not.toMatch(/\bsystemctl\s+(?:enable|start|restart)\s+[^\n]*approved-publisher/);
  });
  it("sends only private throttled Brevo alerts", () => {
    expect(alert).toContain("COOLDOWN_MS = 6 * 60 * 60_000");
    expect(alert).toContain("senderAddress");
    expect(alert).toContain("GROWTH_APPROVED_PUBLISHER_ALERT_ENABLED");
    expect(alert).toContain("STATE_DIRECTORY");
    expect(alert).toContain("GROWTH_APPROVED_PUBLISHER_ALERT=ERROR");
  });
});
