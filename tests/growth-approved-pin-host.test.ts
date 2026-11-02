import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const installer = readFileSync("workers/install-growth-approved-pin-systemd.sh", "utf8");
const launcher = readFileSync("workers/growth-approved-pin-launch.cjs", "utf8");
const runner = readFileSync("workers/growth-approved-pin-tick.ts", "utf8");
const publisher = readFileSync("lib/growth/publishing/service.ts", "utf8");

describe("only individually approved Pins can auto-publish", () => {
  it("installs a separate disabled publishing service, 15-minute timer and alert", () => {
    execFileSync("bash", ["-n", "workers/install-growth-approved-pin-systemd.sh"]);
    execFileSync("node", ["--check", "workers/growth-approved-pin-launch.cjs"]);
    execFileSync("node", ["--check", "workers/growth-approved-pin-alert.cjs"]);
    expect(installer).toContain("OnCalendar=*-*-* *:00,15,30,45:00 UTC");
    expect(installer).toContain("OnFailure=$ALERT");
    expect(installer).toContain("APPROVED_PIN_INSTALL=INSTALLED_DISABLED");
    expect(installer).not.toContain("systemctl enable");
    expect(installer).not.toContain("systemctl start");
  });
  it("enforces scoped worker, official production API and hard approval snapshot validation", () => {
    expect(launcher).toContain("WATCHDOG_EXPECTED_RELEASE_SHA=");
    expect(launcher).toContain("validatedDatabaseUrl(rows)");
    expect(launcher).toContain("loadPinterestRuntimeEnv(APP)");
    expect(launcher).toContain("GROWTH_APPROVED_PUBLISH_APPROVAL");
    expect(launcher).toContain("GROWTH_APPROVED_PUBLISH_LAUNCH=BLOCKED");
    expect(launcher).not.toContain("OPENAI_API_KEY");
    expect(launcher).not.toContain("console.log(child.stderr)");
    expect(runner).toContain("GrowthPinApprovalStatus.APPROVED");
    expect(runner).toContain("onlyJobId: selected.publishJobId");
    expect(runner).toContain("revokeGrowthWorkerActivation(deadline)");
    expect(publisher).toContain("pinApprovalSnapshotChecksum(rebuilt)");
    expect(publisher).toContain("PIN_RECONCILED");
    expect(publisher).toContain("PinterestCreateAmbiguousError");
  });
});
