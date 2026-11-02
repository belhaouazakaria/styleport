import { describe, expect, it } from "vitest";
import { assertMonthlyRecommendationRuntime } from "@/workers/growth-recommend-monthly";

const sha = "a".repeat(40);
const base = {
  EXPECTED_RELEASE: sha,
  GROWTH_MONTHLY_RECOMMEND_APPROVAL: "SAYTWIST_MONTHLY_RECOMMEND:" + sha,
  GROWTH_MONTHLY_RECOMMEND_ENTRYPOINT: "true",
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://u:p@127.0.0.1:5433/saytwist",
  GROWTH_WORKER_RUN_ENABLED: "false",
  GROWTH_DAILY_REPORT_SCHEDULE_ENABLED: "false",
  TELEGRAM_REPORTS_ENABLED: "false",
  GROWTH_ATTRIBUTION_COLLECTION_ENABLED: "false",
  GROWTH_ROLLOUT_MODE: "OFF",
};
const identity = { username: "saytwist", uid: 1001, cwd: "/home/saytwist/htdocs/saytwist.com",
  node: "/home/saytwist/.nvm/versions/node/v24.20.0/bin/node" };
const at = (d: string) => new Date(d);

describe("bounded monthly deterministic RECOMMEND execution", () => {
  it("admits correct host, SHA and first-day 15:00 UTC", () => {
    expect(assertMonthlyRecommendationRuntime(base, sha, identity, at("2026-12-01T15:05:00Z"))).toBe(sha);
  });
  it("rejects other months, time windows and release mismatch", () => {
    for (const d of ["2026-11-30T15:01:00Z", "2026-12-01T14:59:00Z", "2026-12-01T15:15:00Z"]) {
      expect(() => assertMonthlyRecommendationRuntime(base, sha, identity, at(d))).toThrow();
    }
    expect(() => assertMonthlyRecommendationRuntime(base, "b".repeat(40), identity, at("2026-12-01T15:01:00Z"))).toThrow();
  });
  it("refuses enabled general worker, Telegram, attribution, or unexpected database", () => {
    for (const flag of ["GROWTH_WORKER_RUN_ENABLED", "TELEGRAM_REPORTS_ENABLED",
      "GROWTH_ATTRIBUTION_COLLECTION_ENABLED", "GROWTH_DAILY_REPORT_SCHEDULE_ENABLED"]) {
      expect(() => assertMonthlyRecommendationRuntime({ ...base, [flag]: "true" },
        sha, identity, at("2026-12-01T15:01:00Z"))).toThrow();
    }
    expect(() => assertMonthlyRecommendationRuntime({ ...base,
      DATABASE_URL: "postgresql://u:p@localhost:5433/saytwist",
    }, sha, identity, at("2026-12-01T15:01:00Z"))).toThrow();
  });
});
