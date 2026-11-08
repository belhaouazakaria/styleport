import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const installer = readFileSync("workers/install-growth-daily-account-analytics-systemd.sh", "utf8");
const launcher = readFileSync("workers/growth-daily-account-analytics-launch.cjs", "utf8");
const runner = readFileSync("workers/growth-daily-account-analytics.ts", "utf8");
const alert = readFileSync("workers/growth-daily-account-analytics-alert.cjs", "utf8");

describe("daily account analytics installed only as disabled owner opt-in", () => {
  it("validates service/alert syntax and 04:20 UTC scheduled window", () => {
    execFileSync("bash", ["-n", "workers/install-growth-daily-account-analytics-systemd.sh"]);
    execFileSync("node", ["--check", "workers/growth-daily-account-analytics-launch.cjs"]);
    execFileSync("node", ["--check", "workers/growth-daily-account-analytics-alert.cjs"]);
    expect(installer).toContain("OnCalendar=*-*-* 04:20:00 UTC");
    expect(installer).toContain("Persistent=false");
    expect(installer).toContain("GROWTH_DAILY_ACCOUNT_ANALYTICS_INSTALL=INSTALLED_DISABLED");
    expect(installer).toContain("OnFailure=$ALERT");
    expect(installer).not.toContain("systemctl enable");
    expect(installer).not.toContain("systemctl start");
    expect(alert).toContain("GROWTH_DAILY_ACCOUNT_ANALYTICS_ALERT_ENABLED");
  });
  it("pins runtime and isolates a single scoped account read", () => {
    expect(launcher).toContain("loadPinterestRuntimeEnv(APP)");
    expect(launcher).toContain("validatedDatabaseUrl(rows)");
    expect(launcher).toContain("WATCHDOG_EXPECTED_RELEASE_SHA=");
    expect(launcher).toContain('GROWTH_AI_IMAGE_ENABLED: "false"');
    expect(launcher).not.toContain("OPENAI_API_KEY");
    expect(launcher).not.toContain("TELEGRAM_BOT_TOKEN");
    expect(launcher).not.toContain("console.log(child.stderr)");
    expect(runner).toContain("onlyJobId: jobId");
    expect(runner).toContain("maxAttempts: 1");
    expect(runner).toContain("countBlockingGrowthJobs(tx)");
    expect(runner).toContain("revokeGrowthWorkerActivation(deadline)");
    expect(runner).not.toContain("PINTEREST_PIN_PUBLISH");
  });
});
