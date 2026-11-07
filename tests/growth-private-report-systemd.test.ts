import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const installPath = "workers/install-growth-private-report-systemd.sh";
const install = readFileSync(installPath, "utf8");
const launch = readFileSync("workers/growth-private-report-launch.cjs", "utf8");

describe("private Telegram reporting timer: disabled-by-default host isolation", () => {
  it("has valid shell and Node syntax", () => {
    expect(() => execFileSync("bash", ["-n", installPath])).not.toThrow();
    expect(() => execFileSync("node", ["--check", "workers/growth-private-report-launch.cjs"]))
      .not.toThrow();
  });
  it("installs a disabled exact-SHA root-owned timer with private credentials", () => {
    expect(install).toContain('0:0:700');
    expect(install).toContain('0:0:600');
    expect(install).toContain('EnvironmentFile=$ENV');
    expect(install).toContain('TELEGRAM_REPORTS_ENABLED=true');
    expect(install).toContain('GROWTH_DAILY_REPORT_SCHEDULE_ENABLED=true');
    expect(install).toContain('OnCalendar=*-*-* 05:05:00 UTC');
    expect(install).toContain('Persistent=false');
    expect(install).toContain('User=saytwist');
    expect(install).toContain('PRIVATE_REPORT_INSTALL=INSTALLED_DISABLED');
    expect(install).not.toMatch(/systemctl\s+(?:enable|start|restart)\s+[^\n]*private-report/);
  });
  it("keeps report delivery independent of generic Growth, AI and Pinterest", () => {
    expect(launch).toContain("validatedDatabaseUrl");
    expect(launch).toContain('GROWTH_PRIVATE_REPORT_APPROVAL');
    expect(launch).toContain('GROWTH_DAILY_REPORT_SCHEDULE_ENABLED: "true"');
    expect(launch).toContain('TELEGRAM_REPORTS_ENABLED: "true"');
    expect(launch).toContain('GROWTH_WORKER_RUN_ENABLED: "false"');
    expect(launch).toContain('GROWTH_ROLLOUT_MODE: "OFF"');
    expect(launch).not.toContain("PINTEREST_APP_SECRET");
    expect(launch).not.toContain("GROWTH_OPENAI_API_KEY");
  });
  it("allows only the immutable report result and never prints child errors or tokens", () => {
    expect(launch).toContain('SUBMITTED|ALREADY_SENT');
    expect(launch).toContain('GROWTH_PRIVATE_REPORT=BLOCKED');
    expect(launch).not.toContain("console.error");
    expect(launch).not.toContain("child.stderr");
    expect(launch).not.toContain("process.stdout.write(child.stdout");
    expect(launch).toContain('now.getUTCHours() !== 5');
    expect(launch).toContain('read(key) === "true"');
  });
});
