import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const runner = readFileSync("workers/growth-daily-observe.ts", "utf8");
const launcher = readFileSync("workers/growth-daily-observe-launch.cjs", "utf8");
const helper = readFileSync("lib/growth/pinterest/daily-observe-freshness.ts", "utf8");

describe("safe daily OBSERVE zero-request existing-sync outcome", () => {
  it("only permits existing-success shortcut in scheduled mode", () => {
    expect(runner).toContain('mode === "SCHEDULED"');
    expect(runner).toContain("hasVerifiedRecentPinterestAccountSync()");
    expect(runner).toContain('job: "EXISTING_SUCCEEDED"');
    expect(runner).toContain("providerGets: 0");
    expect(runner).toContain("runOneAccountSync(sha, { dailyUtcDate: day })");
  });
  it("keeps a strict output contract for the new zero-GET result", () => {
    expect(launcher).toContain("GROWTH_DAILY_OBSERVE=ALREADY_FRESH");
    expect(launcher).toContain("GROWTH_DAILY_OBSERVE_JOB=EXISTING_SUCCEEDED");
    expect(launcher).toContain("GROWTH_DAILY_OBSERVE_PROVIDER_GETS=0");
    expect(launcher).toContain('mode === "SCHEDULED"');
    expect(launcher).toContain("!allowed.includes(output)");
    expect(launcher).not.toContain("console.log(child.stderr)");
  });
  it("does not waive the existing durable 24h GET budget or write job rows", () => {
    expect(helper).toContain("countBlockingGrowthJobs(prisma)");
    expect(helper).toContain("status: GrowthJobStatus.SUCCEEDED");
    expect(helper).toContain("lastAccountSyncAt");
    expect(helper).toContain("lastSuccessfulApiCallAt");
    expect(helper).not.toContain("growthJob.create(");
    expect(helper).not.toContain("reserveOneAccountSyncRequest(");
    expect(helper).not.toContain("getValidPinterestAccessToken(");
  });
});
