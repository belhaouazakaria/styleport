import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const installer = readFileSync("workers/install-growth-viral-discovery-systemd.sh", "utf8");
const coordinator = readFileSync("workers/coordinate-growth-nine-timer-multi-account-preview-release.sh", "utf8");
const launch = readFileSync("workers/growth-viral-discovery-launch.cjs", "utf8");
const worker = readFileSync("workers/growth-viral-discovery.ts", "utf8");

describe("daily discovery rollout remains separately opt-in", () => {
  it("validates installer and release shell syntax", () => {
    expect(() => execFileSync("bash", ["-n", "workers/install-growth-viral-discovery-systemd.sh"])).not.toThrow();
    expect(() => execFileSync("bash", ["-n", "workers/coordinate-growth-nine-timer-multi-account-preview-release.sh"])).not.toThrow();
  });
  it("installs disabled-only review-only discovery at 08:15 UTC", () => {
    expect(installer).toContain('GROWTH_VIRAL_DISCOVERY_INSTALL=INSTALLED_DISABLED');
    expect(installer).toContain('OnCalendar=*-*-* 08:15:00 UTC');
    expect(installer).toContain("User=saytwist");
    expect(installer).toContain("0:0:700");
    expect(installer).toContain("NoNewPrivileges=true");
    expect(installer).toContain("Environment=GROWTH_VIRAL_DISCOVERY_ENABLED=true");
    expect(installer).toContain("OnFailure=$ALERT");
    expect(installer).not.toMatch(/systemctl\s+(enable|start|restart)\s+.*growth-viral-discovery/);
    expect(launch).toContain("validatedDatabaseUrl");
    expect(launch).toContain('GROWTH_VIRAL_DISCOVERY_OWNER_APPROVAL');
    expect(launch).toContain('GROWTH_AI_IMAGE_ENABLED: "false"');
    expect(launch).toContain('GROWTH_WORKER_RUN_ENABLED: "false"');
    expect(worker).toContain('scanViralSourceCatalog');
    expect(worker).toContain('["REVIEW", "ACTIVE"].includes(viral?.mode ?? "")');
    expect(worker).toContain("prepareDailySourceCreativeDrafts");
  });
  it("holds/restores exactly nine prior timers and preserves all global OFF gates", () => {
    expect(coordinator).toContain("b0ecf638effe2ca5212989d817d2f8c186bb4f57");
    expect(coordinator).toContain("== 35");
    expect(coordinator).toContain("GROWTH_NINE_RELEASE_APPROVAL");
    expect(coordinator).toContain("GROWTH_NINE_AUDIT=PASSED");
    expect(coordinator).toContain("GROWTH_NINE_HOLD=PASSED");
    expect(coordinator).toContain("GROWTH_NINE_RESTORE=PASSED");
    expect(coordinator).toContain("saytwist-growth-$n.timer");
    expect(coordinator).toContain("safe_db");
    expect(coordinator).toContain('mode=\x27REVIEW\x27');
    expect(coordinator).not.toContain("saytwist-growth-viral-discovery.timer");
  });
});
