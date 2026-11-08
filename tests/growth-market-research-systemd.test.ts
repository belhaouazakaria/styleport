import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const installer = readFileSync("workers/install-growth-market-research-systemd.sh", "utf8");
const launcher = readFileSync("workers/growth-market-research-launch.cjs", "utf8");
const runner = readFileSync("workers/growth-market-research.ts", "utf8");
const alert = readFileSync("workers/growth-market-research-alert.cjs", "utf8");

describe("source-vetted market discovery remains disabled until owner approval", () => {
  it("has valid scripts and disabled, independent 05:10 UTC schedule", () => {
    execFileSync("bash", ["-n", "workers/install-growth-market-research-systemd.sh"]);
    execFileSync("node", ["--check", "workers/growth-market-research-launch.cjs"]);
    execFileSync("node", ["--check", "workers/growth-market-research-alert.cjs"]);
    expect(installer).toContain("OnCalendar=*-*-* 05:10:00 UTC");
    expect(installer).toContain("Persistent=false");
    expect(installer).toContain("GROWTH_MARKET_RESEARCH_INSTALL=INSTALLED_DISABLED");
    expect(installer).toContain("OnFailure=$ALERT");
    expect(installer).toContain("EnvironmentFile=-/etc/saytwist-growth-market-research-approval.env");
    expect(installer).not.toContain("systemctl enable");
    expect(installer).not.toContain("systemctl start");
    expect(alert).toContain("GROWTH_MARKET_RESEARCH_ALERT_ENABLED");
  });
  it("keeps provider credentials scoped and existing six live timers pinned", () => {
    expect(launcher).toContain("loadPinterestRuntimeEnv(APP)");
    expect(launcher).toContain("validatedDatabaseUrl(processes)");
    expect(launcher).toContain("WATCHDOG_EXPECTED_RELEASE_SHA=");
    expect(launcher).toContain("saytwist-growth-private-report");
    expect(launcher).toContain("saytwist-growth-daily-fresh");
    expect(launcher).toContain("GROWTH_PINTEREST_TRENDS_ACCESS_APPROVED");
    expect(launcher).not.toContain("OPENAI_API_KEY");
    expect(launcher).not.toContain("TELEGRAM_BOT_TOKEN");
    expect(launcher).not.toContain("console.log(child.stderr)");
    expect(runner).toContain("planProactiveMarketResearch");
    expect(runner).toContain("fetchAuthorizedPinterestMarketTrends");
    expect(runner).toContain("evaluateAndArchiveMarketTrends");
    expect(runner).toContain('workerActivationExpiresAt !== null');
    expect(runner).not.toContain("PINTEREST_PIN_PUBLISH");
  });
});
