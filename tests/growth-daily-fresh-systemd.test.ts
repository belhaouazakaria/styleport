import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const install = readFileSync("workers/install-growth-daily-fresh-systemd.sh", "utf8");
const launch = readFileSync("workers/growth-daily-fresh-launch.cjs", "utf8");
const worker = readFileSync("workers/growth-daily-fresh-creatives.ts", "utf8");
const alert = readFileSync("workers/growth-daily-fresh-alert.cjs", "utf8");

describe("Phase14M daily no-AI creative production safety", () => {
  it("installs a root-owned disabled 07:02 UTC timer and separate private alert", () => {
    expect(() => execFileSync("bash", ["-n", "workers/install-growth-daily-fresh-systemd.sh"]))
      .not.toThrow();
    expect(install).toContain("0:0:700");
    expect(install).toContain("0:0:600");
    expect(install).toContain("OnCalendar=*-*-* 07:02:00 UTC");
    expect(install).toContain("Persistent=false");
    expect(install).toContain("User=saytwist");
    expect(install).toContain("NoNewPrivileges=true");
    expect(install).toContain("OnFailure=$ALERT");
    expect(install).toContain("GROWTH_DAILY_FRESH_INSTALL=INSTALLED_DISABLED");
    expect(install).not.toMatch(/\bsystemctl\s+(?:enable|start|restart)\s+[^\n]*daily-fresh/);
  });
  it("uses existing watchdog, publisher and exact PM2 database without AI tokens", () => {
    expect(launch).toContain("validatedDatabaseUrl");
    expect(launch).toContain("WATCHDOG_EXPECTED_RELEASE_SHA=");
    expect(launch).toContain("saytwist-growth-approved-publisher.timer");
    expect(launch).toContain("GROWTH_DAILY_FRESH_APPROVAL");
    expect(launch).toContain('GROWTH_AI_IMAGE_ENABLED: "false"');
    expect(launch).toContain('GROWTH_WORKER_RUN_ENABLED: "false"');
    expect(launch).toContain('GROWTH_DAILY_FRESH_PINS_PUBLISHED=0');
    expect(launch).not.toContain("OPENAI_API_KEY");
  });
  it("selects only distinct active translators with useful saved examples", () => {
    expect(worker).toContain("isActive: true, archivedAt: null");
    expect(worker).toContain("examples: { some: {} }");
    expect(worker).toContain("growthPinCandidates: { none: {} }");
    expect(worker).toContain("MIN_DESCRIPTION_LENGTH = 40");
    expect(worker).toContain("GrowthCreativeArchetype.MINIMAL_STATEMENT");
    expect(worker).toContain("useAiExample: false");
    expect(worker).toContain("GrowthAssetGenerationKind.DETERMINISTIC");
    expect(worker).toContain("jobId, limit: 1");
    expect(worker).toContain("await revokeGrowthWorkerActivation(deadline)");
    expect(worker).toContain("GrowthPinCandidateStatus.READY");
    expect(worker).not.toContain("PINTEREST_PIN_PUBLISH");
  });
  it("never includes secrets in the private alert", () => {
    expect(alert).toContain("COOLDOWN_MS = 24 * 60 * 60_000");
    expect(alert).toContain("STATE_DIRECTORY");
    expect(alert).toContain("GROWTH_DAILY_FRESH_ALERT_ENABLED");
    expect(alert).toContain("GROWTH_DAILY_FRESH_ALERT=ERROR");
  });
});
