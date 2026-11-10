import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const coordinator = readFileSync(
  "workers/coordinate-growth-eleven-timer-pending-sync-release.sh", "utf8");
const launch = readFileSync(
  "workers/growth-owner-queued-pinterest-sync-launch.cjs", "utf8");
const worker = readFileSync(
  "workers/growth-owner-queued-pinterest-sync.ts", "utf8");
const workflow = readFileSync(
  ".github/workflows/growth-owner-queued-pinterest-sync.yml", "utf8");

describe("exactly scoped original queued Pin reads with protected release", () => {
  it("validates coordinator Bash syntax and launcher Node syntax", () => {
    expect(() => execFileSync("bash", ["-n",
      "workers/coordinate-growth-eleven-timer-pending-sync-release.sh"])).not.toThrow();
    expect(() => execFileSync("node", ["--check",
      "workers/growth-owner-queued-pinterest-sync-launch.cjs"])).not.toThrow();
  });
  it("pins previously deployed SHA and holds/restores all eleven timers", () => {
    expect(coordinator).toContain("217f97d2e07f0f29933e3dab02b35034a3401419");
    expect(coordinator).toContain("viral-discovery viral-source");
    expect(coordinator).toContain('mode=\x27ACTIVE\x27');
    expect(coordinator).toContain('\\"sourceSharePercent\\"=50');
    expect(coordinator).toContain('\\"maxPinsPerDay\\"=5');
    expect(coordinator).toContain("GROWTH_ELEVEN_AUDIT=PASSED");
    expect(coordinator).toContain("GROWTH_ELEVEN_HOLD=PASSED");
    expect(coordinator).toContain("GROWTH_ELEVEN_RESTORE=PASSED");
    expect(coordinator).toContain("ELEVEN_ENABLED_ACTIVE");
    expect(coordinator).toContain("GROWTH_VIRAL_DISCOVERY_OWNER_APPROVAL=");
    expect(coordinator).toContain("GROWTH_VIRAL_SOURCE_OWNER_APPROVAL=");
    expect(coordinator).toContain("SOURCE_ENV=/etc/saytwist-growth-viral-source-approval.env");
    expect(coordinator).toContain("== 35");
    expect(coordinator).not.toContain("systemctl restart");
    expect(coordinator).not.toContain("GROWTH_WORKER_RUN_ENABLED=true");
  });
  it("requires explicit GitHub owner, SHA and approved one-time job dispatch", () => {
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("github.actor == 'belhaouazakaria'");
    expect(workflow).toContain('"$EXPECTED_RELEASE_SHA" == "$GITHUB_SHA"');
    expect(workflow).toContain("COMPLETE TWO OWNER QUEUED PINTEREST SYNCS");
    expect(workflow).toContain("environment: production");
    expect(launch).toContain('GROWTH_OWNER_QUEUED_SYNC_OWNER_APPROVAL');
    expect(launch).toContain("validatedDatabaseUrl(rows)");
    expect(launch).toContain("loadPinterestRuntimeEnv(APP)");
    expect(launch).toContain("GROWTH_OWNER_PENDING_QUEUE=EMPTY");
  });
  it("executes original scoped GET jobs only, never publishes or changes budget", () => {
    expect(worker).toContain('oneExistingJob("BOARD")');
    expect(worker).toContain('oneExistingJob("ACCOUNT")');
    expect(worker).toContain("selectOwnerQueuedPinterestSync(jobs, stage)");
    expect(worker).toContain("onlyJobId: admitted.jobId");
    expect(worker).toContain("reserveOneAccountSyncRequest(");
    expect(worker).toContain("revokeGrowthWorkerActivation(admitted.expiry)");
    expect(worker).toContain("QUEUED_SYNC_PROVIDER_BUDGET_BLOCKED");
    expect(worker).not.toContain("createPinterestPin(");
    expect(worker).not.toContain("growthPinPublication.create(");
    expect(worker).not.toContain("GROWTH_ATTRIBUTION_COLLECTION_ENABLED: \"true\"");
  });
});
