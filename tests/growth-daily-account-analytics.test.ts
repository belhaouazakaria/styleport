import { describe, expect, it } from "vitest";
import { GrowthJobType } from "@prisma/client";
import { assertDailyAccountAnalyticsRuntime, completedUtcAnalyticsWindow } from "@/workers/growth-daily-account-analytics";
import { resolveGrowthRollout } from "@/lib/growth/rollout";
import { runGrowthWorker } from "@/lib/growth/worker";

const sha = "a".repeat(40);
const identity = { username: "saytwist", uid: 1001,
  cwd: "/home/saytwist/htdocs/saytwist.com",
  node: "/home/saytwist/.nvm/versions/node/v24.20.0/bin/node",
};
const env = {
  EXPECTED_RELEASE: sha,
  NODE_ENV: "production",
  GROWTH_DAILY_ANALYTICS_DAY: "2026-11-08",
  GROWTH_DAILY_ANALYTICS_ENABLED: "true",
  GROWTH_DAILY_ANALYTICS_APPROVAL: "SAYTWIST_DAILY_ACCOUNT_ANALYTICS:" + sha,
  DATABASE_URL: "postgresql://app:pass@127.0.0.1:5433/saytwist",
  GROWTH_ROLLOUT_MODE: "OFF",
  GROWTH_WORKER_RUN_ENABLED: "false",
  PINTEREST_API_ENVIRONMENT: "production",
  APP_BASE_URL: "https://saytwist.com",
};

describe("daily official Pinterest account analytics with exact job safety", () => {
  it("uses seven fully elapsed days, never today's incomplete data", () => {
    expect(completedUtcAnalyticsWindow("2026-11-08")).toEqual({
      startDate: "2026-11-01", endDate: "2026-11-07",
    });
    expect(completedUtcAnalyticsWindow("2027-01-03")).toEqual({
      startDate: "2026-12-27", endDate: "2027-01-02",
    });
    for (const date of ["2026-02-30", "2026/11/08", "2026-13-01"]) {
      expect(() => completedUtcAnalyticsWindow(date)).toThrow();
    }
  });
  it("requires exact release, private DB, identity, controls and time window", () => {
    const time = new Date("2026-11-08T04:20:10Z");
    expect(assertDailyAccountAnalyticsRuntime(env, sha, identity, time))
      .toEqual({ sha, day: "2026-11-08" });
    for (const delta of [
      { GROWTH_DAILY_ANALYTICS_APPROVAL: "invalid" },
      { GROWTH_DAILY_ANALYTICS_ENABLED: "false" },
      { GROWTH_DAILY_ANALYTICS_DAY: "2026-11-07" },
      { TELEGRAM_REPORTS_ENABLED: "true" },
      { GROWTH_WORKER_RUN_ENABLED: "true" },
      { GROWTH_AI_IMAGE_ENABLED: "true" },
      { GROWTH_ROLLOUT_MODE: "OBSERVE" },
      { DATABASE_URL: "postgresql://u:p@other:5433/saytwist" },
      { PINTEREST_API_ENVIRONMENT: "sandbox" },
    ]) {
      expect(() => assertDailyAccountAnalyticsRuntime(
        { ...env, ...delta }, sha, identity, time,
      )).toThrow();
    }
    expect(() => assertDailyAccountAnalyticsRuntime(
      env, "b".repeat(40), identity, time,
    )).toThrow();
    expect(() => assertDailyAccountAnalyticsRuntime(
      env, sha, { ...identity, uid: 0 }, time,
    )).toThrow();
    expect(() => assertDailyAccountAnalyticsRuntime(
      env, sha, identity, new Date("2026-11-08T04:35:00Z"),
    )).toThrow();
  });
  it("only admits official account analytics jobs, never Pinterest writes or broad claims", async () => {
    const flags = { GROWTH_WORKER_RUN_ENABLED: "true",
      GROWTH_ROLLOUT_MODE: "ANALYTICS",
      GROWTH_DAILY_ANALYTICS_SCOPE: "true" };
    expect(resolveGrowthRollout({
      GROWTH_WORKER_RUN_ENABLED: "true", GROWTH_ROLLOUT_MODE: "ANALYTICS",
    })).toEqual({ mode: "OFF", allowedTypes: [] });
    expect(resolveGrowthRollout(flags)).toEqual({
      mode: "ANALYTICS",
      allowedTypes: [GrowthJobType.PINTEREST_ACCOUNT_ANALYTICS_SYNC],
    });
    await expect(runGrowthWorker({ rolloutConfig: flags })).resolves.toEqual({
      status: "DISABLED", claimed: 0, succeeded: 0, failed: 0,
    });
  });
});
