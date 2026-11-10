import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const release = readFileSync("workers/coordinate-growth-nine-timer-board-sync-release.sh", "utf8");
const launch = readFileSync("workers/growth-one-board-sync-launch.cjs", "utf8");
const runner = readFileSync("workers/growth-one-board-sync.ts", "utf8");
const handler = readFileSync("lib/growth/handlers.ts", "utf8");
const sync = readFileSync("lib/growth/pinterest/sync.ts", "utf8");
const workflow = readFileSync(".github/workflows/growth-one-board-inventory-sync.yml", "utf8");

describe("Owner-only one-page board sync release safeguards", () => {
  it("keeps nine root units pinned to exact old/new release and all 35 migrations", () => {
    execFileSync("bash", ["-n", "workers/coordinate-growth-nine-timer-board-sync-release.sh"]);
    expect(release).toContain('[[ "$OLD" == fd5d138f1e6e399a0c218eb6ffc5eca74df573d2 ]] || fail');
    expect(release).toContain("STATE=/etc/saytwist-growth-nine-board-sync-release-state");
    expect(release).toContain("bool_and(mode='REVIEW')");
    expect(release).toContain("saytwist-growth-viral-source.timer");
    expect(release).toContain("PINTEREST_BOARD_SYNC");
    expect(release).toContain("PINTEREST_ACCOUNT_SYNC");
    expect(release).toContain("2026-11-09 22:47:00");
    expect(release).toContain('AND "attemptCount"=0 AND "maxAttempts"=3');
    expect(release).toContain("count(*) <= 2");
    expect(release.match(/count_migrations saytwist\)" == 35/g)?.length).toBe(3);
    expect(release).toContain("GROWTH_NINE_AUDIT=PASSED");
    expect(release).toContain("GROWTH_NINE_HOLD=PASSED");
    expect(release).toContain("GROWTH_NINE_RESTORE=PASSED");
    expect(release).toContain("GROWTH_NINE_RELEASE_APPROVAL");
    expect(release).not.toContain('DELETE FROM "GrowthJob"');
    expect(release).not.toContain("migrate deploy");
  });

  it("launches only for deployed exact SHA, healthy watchdog and minimal protected credentials", () => {
    execFileSync("node", ["--check", "workers/growth-one-board-sync-launch.cjs"]);
    expect(launch).toContain("GROWTH_ONE_BOARD_SYNC_LAUNCH");
    expect(launch).toContain("GROWTH_PINTEREST_BOARD_SYNC_APPROVAL");
    expect(launch).toContain("RUN SAYTWIST PINTEREST BOARD SYNC ONCE ");
    expect(launch).toContain("GROWTH_PINTEREST_BOARD_SYNC_ENTRYPOINT");
    expect(launch).toContain("WATCHDOG_EXPECTED_RELEASE_SHA=");
    expect(launch).toContain("validatedDatabaseUrl");
    expect(launch).toContain("SOURCE_PUBLISHER_MUST_REMAIN_DISABLED");
    expect(launch).toContain("GROWTH_ONE_BOARD_SYNC_PROVIDER_WRITES=0");
    expect(launch).toContain("GROWTH_ONE_BOARD_SYNC_PINS_PUBLISHED=0");
    expect(launch).not.toContain("createPinterestPin(");
  });

  it("validates one existing idle job and disallows provider writes, retries and pagination", () => {
    expect(runner).toContain("jobs.length !== 2");
    expect(runner).toContain('jobs.filter(job => job.type === GrowthJobType.PINTEREST_BOARD_SYNC)');
    expect(runner).toContain('jobs.filter(job => job.type === GrowthJobType.PINTEREST_ACCOUNT_SYNC)');
    expect(runner).toContain("GROWTH_PINTEREST_BOARD_SYNC_JOB_ID");
    expect(runner).toContain("onlyJobId: boardJobId, batchSize: 1");
    expect(runner).toContain("await revokeGrowthWorkerActivation(deadline)");
    expect(runner).toContain("workerActivationExpiresAt: deadline");
    expect(handler).toContain("oneBoardSyncFetch(job.id), { maxPages: 1 }");
    expect(sync).toContain("if (maxPages === 1 && boards.length === 0)");
    expect(sync).toContain("PINTEREST_BOARD_SYNC_PAGE_LIMIT");
    expect(runner).not.toContain("createPinterestPin(");
    expect(runner).not.toContain("runGrowthWorker({ batchSize:");
  });

  it("allows dispatch only from verified owner main SHA with explicit confirmation", () => {
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).not.toContain("issue_comment:");
    expect(workflow).not.toContain("push:");
    expect(workflow).toContain("github.actor == 'belhaouazakaria'");
    expect(workflow).toContain("github.ref == 'refs/heads/main'");
    expect(workflow).toContain('[[ "$BOARD_CONFIRMATION" == "SYNC BOARD INVENTORY ONCE" ]]');
    expect(workflow).toContain('[[ "$EXPECTED_RELEASE_SHA" == "$GITHUB_SHA" ]]');
    expect(workflow).toContain('envs: EXPECTED_RELEASE');
    expect(workflow).toContain("GROWTH_ONE_BOARD_SYNC_LAUNCH=true");
  });
});
