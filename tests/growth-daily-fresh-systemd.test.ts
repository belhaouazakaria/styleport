import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const install = readFileSync("workers/install-growth-daily-fresh-systemd.sh", "utf8");
const rotate = readFileSync("workers/rotate-growth-daily-fresh-release-systemd.sh", "utf8");
const launch = readFileSync("workers/growth-daily-fresh-launch.cjs", "utf8");
const worker = readFileSync("workers/growth-daily-fresh-creatives.ts", "utf8");
const alert = readFileSync("workers/growth-daily-fresh-alert.cjs", "utf8");

describe("Phase14M daily isolated AI creative production safety", () => {
  it("installs a root-owned disabled 07:02 UTC timer and separate private alert", () => {
    expect(() => execFileSync("bash", ["-n", "workers/install-growth-daily-fresh-systemd.sh"]))
      .not.toThrow();
    expect(install).toContain("0:0:700");
    expect(install).toContain("0:0:600");
    expect(install).toContain("AI_ENV=/etc/saytwist-growth-ai.env");
    expect(install).toContain("EnvironmentFile=$AI_ENV");
    expect(install).toContain("GROWTH_OPENAI_API_KEY=sk-");
    expect(install).toContain("GROWTH_OPENAI_PROJECT_ID=proj_");
    expect(install).toContain("OnCalendar=*-*-* 07:02:00 UTC");
    expect(install).toContain("Persistent=false");
    expect(install).toContain("User=saytwist");
    expect(install).toContain("NoNewPrivileges=true");
    expect(install).toContain("OnFailure=$ALERT");
    expect(install).toContain("GROWTH_DAILY_FRESH_INSTALL=INSTALLED_DISABLED");
    expect(install).not.toMatch(/\bsystemctl\s+(?:enable|start|restart)\s+[^\n]*daily-fresh/);
  });
  it("rotates the installed AI timer to a new SHA only while disabled", () => {
    expect(() => execFileSync("bash", ["-n", "workers/rotate-growth-daily-fresh-release-systemd.sh"]))
      .not.toThrow();
    expect(rotate).toContain("0:0:700");
    expect(rotate).toContain("0:0:600");
    expect(rotate).toContain('EnvironmentFile=$AI_ENV');
    expect(rotate).toContain("WATCHDOG_EXPECTED_RELEASE_SHA=$NEW");
    expect(rotate).toContain("saytwist-growth-approved-publisher.timer");
    expect(rotate).toContain("GROWTH_DAILY_FRESH_ROTATION=READY_DISABLED");
    expect(rotate).toContain("GROWTH_DAILY_FRESH_TIMER=INACTIVE");
    expect(rotate).not.toMatch(/\\bsystemctl\\s+(?:enable|start|restart)\\s+[^\\n]*daily-fresh/);
  });
  it("uses existing watchdog, publisher and only the isolated Growth AI project", () => {
    expect(launch).toContain("validatedDatabaseUrl");
    expect(launch).toContain("WATCHDOG_EXPECTED_RELEASE_SHA=");
    expect(launch).toContain("saytwist-growth-approved-publisher.timer");
    expect(launch).toContain("GROWTH_DAILY_FRESH_APPROVAL");
    expect(launch).toContain('GROWTH_AI_IMAGE_ENABLED: "true"');
    expect(launch).toContain('GROWTH_OPENAI_IMAGE_MODEL: "gpt-image-2"');
    expect(launch).toContain("GROWTH_OPENAI_PROJECT_ID");
    expect(launch).toContain("growthKey === process.env.OPENAI_API_KEY");
    expect(launch).not.toContain("loadEnvConfig(APP");
    expect(launch).toContain('GROWTH_WORKER_RUN_ENABLED: "false"');
    expect(launch).toContain('GROWTH_DAILY_FRESH_PINS_PUBLISHED=0');
    expect(launch).not.toContain("PINTEREST_APP_SECRET");
  });
  it("selects only distinct active translators with useful saved examples", () => {
    expect(worker).toContain("isActive: true, archivedAt: null");
    expect(worker).toContain("editorialExamples: { some: {} }");
    expect(worker).toContain("target.editorialExamples[0]?.originalText.trim().length");
    expect(worker).toContain("target.editorialExamples[0]?.transformedText.trim().length");
    expect(worker).toContain("growthPinCandidates: { none: {} }");
    expect(worker).toContain("MIN_DESCRIPTION_LENGTH = 40");
    expect(worker).toContain("GrowthCreativeArchetype.BEFORE_AFTER");
    expect(worker).toContain("useAiExample: false");
    expect(worker).toContain("GrowthAssetGenerationKind.AI");
    expect(worker).toContain('candidate.asset.aiModel !== "gpt-image-2"');
    expect(worker).toContain("aiCalls: created");
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
