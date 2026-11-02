import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const bootstrap = readFileSync("workers/growth-autonomous-report-launch.cjs", "utf8");
const installer = readFileSync("workers/install-growth-autonomous-report-systemd.sh", "utf8");
const alert = readFileSync("workers/growth-autonomous-report-alert.cjs", "utf8");
const runner = readFileSync("lib/growth/reporting/daily-runner.ts", "utf8");
const delivery = readFileSync("lib/growth/reporting/delivery.ts", "utf8");

describe("one-recipient autonomous daily reporting infrastructure", () => {
  it("only installs disabled reporting with an independent private failure alert", () => {
    execFileSync("bash", ["-n", "workers/install-growth-autonomous-report-systemd.sh"]);
    execFileSync("node", ["--check", "workers/growth-autonomous-report-launch.cjs"]);
    execFileSync("node", ["--check", "workers/growth-autonomous-report-alert.cjs"]);
    expect(installer).toContain("OnCalendar=*-*-* 05:30:00 UTC");
    expect(installer).toContain("Persistent=false");
    expect(installer).toContain("OnFailure=$ALERT");
    expect(installer).toContain("GROWTH_REPORT_INSTALL=INSTALLED_DISABLED");
    expect(installer).not.toContain("systemctl enable");
    expect(installer).not.toContain("systemctl start");
    expect(alert).toContain("GROWTH_AUTONOMOUS_REPORT_ALERT_ENABLED");
  });
  it("uses vetted source, exact release, bounded time and private chat ID only", () => {
    expect(bootstrap).toContain("WATCHDOG_EXPECTED_RELEASE_SHA=");
    expect(bootstrap).toContain("validatedDatabaseUrl(rows)");
    expect(bootstrap).toContain("saytwist-growth-autonomous-cycle.timer");
    expect(bootstrap).toContain("TELEGRAM_REPORT_CHAT_ID");
    expect(bootstrap).toContain("PRIVATE_ID");
    expect(bootstrap).toContain('["[growth-report] SUBMITTED", "[growth-report] ALREADY_SENT"]');
    expect(bootstrap).not.toContain("console.log(child.stderr)");
    expect(bootstrap).not.toContain("process.stdout.write(child.stdout)");
    expect(runner).toContain("ALREADY_ATTEMPTED_SUBMITTED");
    expect(delivery).toContain("GrowthReportDeliveryStatus.SENDING");
    expect(delivery).toContain("OUTCOME_UNKNOWN");
  });
});
