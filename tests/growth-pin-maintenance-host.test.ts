import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (name: string) => readFileSync("workers/" + name, "utf8");
const install = read("install-growth-pin-maintenance-systemd.sh");
const launcher = read("growth-pin-maintenance-launch.cjs");
const worker = read("growth-pin-maintenance.ts");
const analytics = readFileSync("lib/growth/pinterest/analytics.ts", "utf8");
const alert = read("growth-pin-maintenance-alert.cjs");

describe("12th Pin maintenance timer opt-in safety contract", () => {
  it("passes Bash and Node syntax checks", () => {
    expect(() => execFileSync("bash", ["-n",
      "workers/install-growth-pin-maintenance-systemd.sh"])).not.toThrow();
    expect(() => execFileSync("node", ["--check",
      "workers/growth-pin-maintenance-launch.cjs"])).not.toThrow();
    expect(() => execFileSync("node", ["--check",
      "workers/growth-pin-maintenance-alert.cjs"])).not.toThrow();
  });
  it("does not enable or start the newly installed timer", () => {
    expect(install).toContain("Persistent=false");
    expect(install).toContain("OnCalendar=*-*-* 10,12,14,16,18,20,22:45:00 UTC");
    expect(install).toContain("User=saytwist");
    expect(install).toContain("OnFailure=$ALERT");
    expect(install).toContain("GROWTH_PIN_MAINTENANCE_INSTALL=INSTALLED_DISABLED");
    expect(install).toContain("GROWTH_PIN_MAINTENANCE_TIMER=INACTIVE");
    expect(install).toContain("systemd-analyze verify");
    expect(install).not.toMatch(/systemctl\s+enable\s+--now/);
    expect(install).not.toMatch(/systemctl\s+start\s+.*pin-maintenance/);
    expect(install).toContain("saytwist-growth-viral-discovery");
    expect(install).toContain("saytwist-growth-viral-source");
  });
  it("isolates producer credentials and requires an exact SHA, private owner approval and 11 running timers", () => {
    expect(launcher).toContain("validatedDatabaseUrl(rows)");
    expect(launcher).toContain("loadPinterestRuntimeEnv(APP)");
    expect(launcher).toContain("GROWTH_PIN_MAINTENANCE_OWNER_APPROVAL");
    expect(launcher).toContain("GROWTH_PIN_MAINTENANCE_LAUNCH=BLOCKED");
    expect(launcher).toContain("viral-discovery");
    expect(launcher).toContain("viral-source");
    expect(launcher).not.toContain("console.log(child.stderr)");
    expect(launcher).not.toContain("createPinterestPin(");
    expect(launcher).not.toContain("GROWTH_WORKER_RUN_ENABLED: \"true\"");
  });
  it("never enqueues, activates a broad worker, publishes Pins or performs AI calls", () => {
    expect(worker).toContain("PIN_MAINTENANCE_SLOT_RESERVED");
    expect(worker).toContain("countBlockingGrowthJobs(tx)");
    expect(worker).toContain("maintenanceBounded: true");
    expect(worker).not.toContain("growthJob.create");
    expect(worker).not.toContain("runGrowthWorker(");
    expect(worker).not.toContain("enqueueGrowthJob(");
    expect(worker).not.toContain("createPinterestPin(");
    expect(worker).not.toContain("growthSettings.updateMany(");
    expect(worker).not.toContain("GROWTH_WORKER_RUN_ENABLED: \"true\"");
  });
  it("keeps existing generic queue-continuation behavior unchanged, suppresses only bounded mode", () => {
    expect(analytics).toContain("params.maintenanceBounded ? 1 : PINTEREST_INVENTORY_REQUESTS_PER_JOB");
    expect(analytics).toContain("params.maintenanceBounded ? 1 : PINTEREST_PIN_REQUESTS_PER_JOB");
    expect((analytics.match(/if \(!params\.maintenanceBounded\) await enqueueGrowthJob\(/g) || []).length).toBe(3);
  });
  it("alerts at most once per day on an isolated state directory", () => {
    expect(alert).toContain("GROWTH_PIN_MAINTENANCE_ALERT_ENABLED");
    expect(alert).toContain("saytwist-growth-pin-maintenance");
    expect(alert).toContain("24 * 60 * 60 * 1000");
  });
});
