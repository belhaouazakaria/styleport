import { describe, expect, it } from "vitest";
import { GrowthJobType } from "@prisma/client";
import {
  assertAutonomousCycleRuntime, planAutonomousGrowthCycle,
} from "@/workers/growth-autonomous-cycle";

const sha = "a".repeat(40);
const identity = {
  username: "saytwist", uid: 1001,
  cwd: "/home/saytwist/htdocs/saytwist.com",
  node: "/home/saytwist/.nvm/versions/node/v24.20.0/bin/node",
};
const config = {
  NODE_ENV: "production", EXPECTED_RELEASE: sha,
  GROWTH_AUTONOMOUS_CYCLE_DATE: "2026-11-04",
  GROWTH_AUTONOMOUS_CYCLE_ENABLED: "true",
  GROWTH_AUTONOMOUS_CYCLE_APPROVAL: "SAYTWIST_GROWTH_CYCLE_SCHEDULED:" + sha,
  DATABASE_URL: "postgresql://user:password@127.0.0.1:5433/saytwist",
  GROWTH_WORKER_RUN_ENABLED: "false", GROWTH_ROLLOUT_MODE: "OFF",
};

describe("Phase14I daily offline Growth analysis", () => {
  it("creates exactly three deterministic allowed jobs without AI or publication", () => {
    const jobs = planAutonomousGrowthCycle("2026-11-04");
    expect(jobs.map(x => x.type)).toEqual([
      GrowthJobType.ACCOUNT_STRATEGY_REVIEW,
      GrowthJobType.OPPORTUNITY_INTELLIGENCE_ANALYSIS,
      GrowthJobType.EVERGREEN_LEARNING_ANALYSIS,
    ]);
    expect(new Set(jobs.map(x => x.idempotencyKey)).size).toBe(3);
    expect(jobs[0].payload).toEqual({
      reviewMonth: "2026-11", evidenceWindowEnd: "2026-11-03",
      modelVersion: "account_strategy_v1",
    });
    expect(planAutonomousGrowthCycle("2026-11-04")).toEqual(jobs);
    expect(() => planAutonomousGrowthCycle("2026-02-30")).toThrow();
    expect(() => planAutonomousGrowthCycle("not-a-date")).toThrow();
  });
  it("requires released exact SHA, strict identity and schedule approval", () => {
    const now = new Date("2026-11-04T04:31:00Z");
    expect(assertAutonomousCycleRuntime(config, sha, identity, now))
      .toEqual({ sha, day: "2026-11-04" });
    expect(() => assertAutonomousCycleRuntime(config, "b".repeat(40), identity, now)).toThrow();
    expect(() => assertAutonomousCycleRuntime({ ...config,
      GROWTH_AUTONOMOUS_CYCLE_APPROVAL: "bad" }, sha, identity, now)).toThrow();
    expect(() => assertAutonomousCycleRuntime(config, sha, { ...identity, uid: 0 }, now)).toThrow();
    expect(() => assertAutonomousCycleRuntime(config, sha, identity,
      new Date("2026-11-04T04:29:59Z"))).toThrow();
    expect(() => assertAutonomousCycleRuntime(config, sha, identity,
      new Date("2026-11-04T04:50:00Z"))).toThrow();
    expect(() => assertAutonomousCycleRuntime({ ...config,
      GROWTH_AUTONOMOUS_CYCLE_DATE: "2026-11-03" }, sha, identity, now)).toThrow();
  });
  it("permits only exact owner-approved one-shot mode outside the daily calendar", () => {
    const at = new Date("2026-11-03T20:30:00Z");
    const trial = {
      ...config,
      GROWTH_AUTONOMOUS_CYCLE_DATE: "2026-11-03",
      GROWTH_AUTONOMOUS_CYCLE_MODE: "TRIAL",
      GROWTH_AUTONOMOUS_CYCLE_APPROVAL: "RUN SAYTWIST GROWTH CYCLE TRIAL " + sha,
    };
    expect(assertAutonomousCycleRuntime(trial, sha, identity, at))
      .toEqual({ sha, day: "2026-11-03" });
    expect(() => assertAutonomousCycleRuntime({ ...trial,
      GROWTH_AUTONOMOUS_CYCLE_APPROVAL: "SAYTWIST_GROWTH_CYCLE_SCHEDULED:" + sha,
    }, sha, identity, at)).toThrow();
    expect(() => assertAutonomousCycleRuntime({ ...trial,
      GROWTH_AUTONOMOUS_CYCLE_MODE: "TRIAL-UNSAFE",
    }, sha, identity, at)).toThrow();
    expect(() => assertAutonomousCycleRuntime({ ...config,
      GROWTH_AUTONOMOUS_CYCLE_DATE: "2026-11-03",
    }, sha, identity, at)).toThrow();
  });
  it("rejects any simultaneous content, billing or reporting automation", () => {
    for (const key of ["GROWTH_WORKER_RUN_ENABLED",
      "GROWTH_DAILY_REPORT_SCHEDULE_ENABLED", "TELEGRAM_REPORTS_ENABLED",
      "GROWTH_ATTRIBUTION_COLLECTION_ENABLED"]) {
      expect(() => assertAutonomousCycleRuntime({
        ...config, [key]: "true",
      }, sha, identity, new Date("2026-11-04T04:35:00Z"))).toThrow();
    }
    for (const mode of ["OBSERVE", "RECOMMEND"]) {
      expect(() => assertAutonomousCycleRuntime({
        ...config, GROWTH_ROLLOUT_MODE: mode,
      }, sha, identity, new Date("2026-11-04T04:35:00Z"))).toThrow();
    }
    expect(() => assertAutonomousCycleRuntime({
      ...config, DATABASE_URL: "postgresql://user:pass@localhost:5433/saytwist",
    }, sha, identity, new Date("2026-11-04T04:35:00Z"))).toThrow();
  });
});
