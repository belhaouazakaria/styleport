import { describe, expect, it } from "vitest";
import { assertScheduledMarketResearchRuntime } from "@/workers/growth-market-research";

const sha = "a".repeat(40);
const identity = { username: "saytwist", uid: 1001,
  cwd: "/home/saytwist/htdocs/saytwist.com",
  node: "/home/saytwist/.nvm/versions/node/v24.20.0/bin/node" };
const now = new Date("2026-11-08T05:10:15.000Z");
const env = {
  NODE_ENV: "production",
  EXPECTED_RELEASE: sha,
  GROWTH_MARKET_RESEARCH_DAY: "2026-11-08",
  GROWTH_MARKET_RESEARCH_ENABLED: "true",
  GROWTH_PINTEREST_TRENDS_ACCESS_APPROVED: "true",
  GROWTH_MARKET_RESEARCH_APPROVAL: "SAYTWIST_MARKET_RESEARCH:" + sha,
  GROWTH_ROLLOUT_MODE: "OFF",
  PINTEREST_API_ENVIRONMENT: "production",
  APP_BASE_URL: "https://saytwist.com",
  DATABASE_URL: "postgresql://user:pass@127.0.0.1:5433/saytwist",
  GROWTH_WORKER_RUN_ENABLED: "false",
  GROWTH_ATTRIBUTION_COLLECTION_ENABLED: "false",
  TELEGRAM_REPORTS_ENABLED: "false",
  GROWTH_DAILY_REPORT_SCHEDULE_ENABLED: "false",
  GROWTH_AI_IMAGE_ENABLED: "false",
};
describe("owner-gated proactive market research runtime", () => {
  it("accepts only the exact release and bounded scheduled UTC window", () => {
    expect(assertScheduledMarketResearchRuntime(env, sha, identity, now))
      .toEqual({ sha, day: "2026-11-08" });
    expect(() => assertScheduledMarketResearchRuntime(env, sha, identity,
      new Date("2026-11-08T06:00:00Z"))).toThrow();
  });
  it("fails closed on absent provider permission, wrong identity or unsafe DB", () => {
    for (const override of [
      { GROWTH_MARKET_RESEARCH_ENABLED: "false" },
      { GROWTH_PINTEREST_TRENDS_ACCESS_APPROVED: "false" },
      { GROWTH_MARKET_RESEARCH_APPROVAL: "SAYTWIST_MARKET_RESEARCH:" + "b".repeat(40) },
      { GROWTH_ROLLOUT_MODE: "AUTOPILOT" },
      { TELEGRAM_REPORTS_ENABLED: "true" },
      { GROWTH_AI_IMAGE_ENABLED: "true" },
      { DATABASE_URL: "postgresql://user:pass@localhost:5433/saytwist" },
      { DATABASE_URL: "postgresql://user:pass@127.0.0.1:5433/other" },
      { APP_BASE_URL: "https://other.example" },
    ]) {
      expect(() => assertScheduledMarketResearchRuntime(
        { ...env, ...override }, sha, identity, now)).toThrow();
    }
    expect(() => assertScheduledMarketResearchRuntime(
      env, "b".repeat(40), identity, now)).toThrow();
    expect(() => assertScheduledMarketResearchRuntime(
      env, sha, { ...identity, uid: 0 }, now)).toThrow();
  });
});
