import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const installer = readFileSync("workers/install-growth-daily-observe-systemd.sh", "utf8");
const launcher = readFileSync("workers/growth-daily-observe-launch.cjs", "utf8");
const workflow = readFileSync(".github/workflows/growth-daily-observe-trial.yml", "utf8");

describe("Phase14G disabled-by-default timer and owner trial", () => {
  it("never starts or enables the timer during installation", () => {
    expect(installer).toContain("Persistent=false");
    expect(installer).toContain("OnCalendar=*-*-* 13:00:00 UTC");
    expect(installer).toContain("User=saytwist");
    expect(installer).toContain("GROWTH_DAILY_OBSERVE_MODE=SCHEDULED");
    expect(installer).toContain("systemd-analyze verify");
    expect(installer).not.toMatch(/systemctl\s+enable\s+--now/);
    expect(installer).not.toMatch(/systemctl\s+start\s+.*daily-observe/);
  });
  it("rejects missing watchdog and untrusted PM2 runtime before loading secrets", () => {
    expect(launcher).toContain("WATCHDOG_EXPECTED_RELEASE_SHA=");
    expect(launcher).toContain("validatedDatabaseUrl(rows)");
    expect(launcher).toContain('GROWTH_DAILY_OBSERVE_MODE: mode');
    expect(launcher).toContain('GROWTH_DAILY_OBSERVE_ENTRYPOINT: "true"');
    expect(launcher).toContain("GROWTH_DAILY_OBSERVE_LAUNCH=BLOCKED");
    expect(launcher).not.toContain("console.log(child.stderr)");
  });
  it("accepts trial only through an owner-created issue comment", () => {
    expect(workflow).toContain("github.event.comment.user.login == 'belhaouazakaria'");
    expect(workflow).toContain("validate-growth-daily-observe-request.mjs");
    expect(workflow).toContain("GROWTH_DAILY_OBSERVE_MODE=TRIAL");
    expect(workflow).toContain("concurrency:");
  });
});
