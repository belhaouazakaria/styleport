import { describe, expect, it } from "vitest";

import { planDailyFreshCreatives } from "@/lib/growth/operations/daily-fresh-creative-plan";
import { assertDailyFreshRuntime } from "@/workers/growth-daily-fresh-creatives";

const sha = "a".repeat(40);
const identity = {
  username: "saytwist", uid: 1001,
  cwd: "/home/saytwist/htdocs/saytwist.com",
  node: "/home/saytwist/.nvm/versions/node/v24.20.0/bin/node",
};
const policy = { mode: "AUTO" as const, minimum: 1, maximum: 10, fixed: null };
const env = {
  NODE_ENV: "production", EXPECTED_RELEASE: sha,
  GROWTH_DAILY_FRESH_ENABLED: "true",
  GROWTH_DAILY_FRESH_DAY: "2026-11-07",
  GROWTH_DAILY_FRESH_MODE: "SCHEDULED",
  GROWTH_DAILY_FRESH_APPROVAL: "SAYTWIST_DAILY_FRESH_SCHEDULED:" + sha,
  APP_BASE_URL: "https://saytwist.com",
  DATABASE_URL: "postgresql://user:pass@127.0.0.1:5433/saytwist",
  GROWTH_WORKER_RUN_ENABLED: "false",
  GROWTH_DAILY_REPORT_SCHEDULE_ENABLED: "false",
  TELEGRAM_REPORTS_ENABLED: "false",
  GROWTH_ATTRIBUTION_COLLECTION_ENABLED: "false",
  GROWTH_AI_IMAGE_ENABLED: "true",
  GROWTH_OPENAI_IMAGE_MODEL: "gpt-image-2",
  GROWTH_OPENAI_API_KEY: "sk-test_growth_project_123456",
  GROWTH_OPENAI_PROJECT_ID: "proj_test_123456",
  GROWTH_ROLLOUT_MODE: "OFF",
};

describe("Phase14M daily budgeted AI Pinterest drafts", () => {
  it("prepares only one original candidate when performance evidence is unknown", () => {
    expect(planDailyFreshCreatives({
      policy, alreadyCreatedToday: 0,
      eligibleDistinctTargets: 20,
      verifiedRecentOpportunityEvidence: false,
    })).toEqual({
      desired: 1, additional: 1, status: "READY", model: "one-exploration",
    });
  });
  it("scales to a bounded three drafts only with verified recent opportunity evidence", () => {
    expect(planDailyFreshCreatives({
      policy, alreadyCreatedToday: 1,
      eligibleDistinctTargets: 10,
      verifiedRecentOpportunityEvidence: true,
    })).toEqual({
      desired: 3, additional: 2, status: "READY", model: "evidence-guided",
    });
  });
  it("respects FIXED and PAUSED owner controls without exceeding rollout hard cap", () => {
    expect(planDailyFreshCreatives({
      policy: { mode: "FIXED", minimum: 1, maximum: 10, fixed: 7 },
      alreadyCreatedToday: 0, eligibleDistinctTargets: 10,
      verifiedRecentOpportunityEvidence: false,
    })).toEqual({
      desired: 3, additional: 3, status: "READY", model: "owner-fixed",
    });
    expect(planDailyFreshCreatives({
      policy: { mode: "PAUSED", minimum: 1, maximum: 10, fixed: null },
      alreadyCreatedToday: 0, eligibleDistinctTargets: 10,
      verifiedRecentOpportunityEvidence: true,
    })).toEqual({
      desired: 0, additional: 0, status: "PAUSED", model: "paused",
    });
  });
  it("never fabricates content to meet quotas when targets are exhausted", () => {
    expect(planDailyFreshCreatives({
      policy, alreadyCreatedToday: 0, eligibleDistinctTargets: 0,
      verifiedRecentOpportunityEvidence: true,
    }).status).toBe("NO_QUALIFIED_TARGET");
    expect(planDailyFreshCreatives({
      policy, alreadyCreatedToday: 3, eligibleDistinctTargets: 12,
      verifiedRecentOpportunityEvidence: true,
    })).toEqual({
      desired: 3, additional: 0, status: "SATISFIED",
      model: "evidence-guided",
    });
    expect(() => planDailyFreshCreatives({
      policy, alreadyCreatedToday: -1, eligibleDistinctTargets: 5,
      verifiedRecentOpportunityEvidence: true,
    })).toThrow();
  });
  it("allows only the exact owner-approved SHA, private DB and 07:02-07:15 UTC window", () => {
    const at = new Date("2026-11-07T07:02:00Z");
    expect(assertDailyFreshRuntime(env, sha, identity, at))
      .toEqual({ sha, day: "2026-11-07", mode: "SCHEDULED" });
    expect(() => assertDailyFreshRuntime(env, "b".repeat(40), identity, at)).toThrow();
    expect(() => assertDailyFreshRuntime(env, sha, { ...identity, uid: 0 }, at)).toThrow();
    expect(() => assertDailyFreshRuntime(env, sha, identity,
      new Date("2026-11-07T07:15:00Z"))).toThrow();
    expect(() => assertDailyFreshRuntime(env, sha, identity,
      new Date("2026-11-07T07:01:00Z"))).toThrow();
    expect(() => assertDailyFreshRuntime({
      ...env, DATABASE_URL: "postgresql://user:pass@otherhost:5433/saytwist",
    }, sha, identity, at)).toThrow();
  });
  it("supports only a separately owner-authorized TRIAL outside the calendar", () => {
    const trial = {
      ...env, GROWTH_DAILY_FRESH_MODE: "TRIAL",
      GROWTH_DAILY_FRESH_APPROVAL: "RUN SAYTWIST DAILY FRESH TRIAL " + sha,
    };
    expect(assertDailyFreshRuntime(trial, sha, identity,
      new Date("2026-11-07T17:00:00Z"))).toEqual({
      sha, day: "2026-11-07", mode: "TRIAL",
    });
    expect(() => assertDailyFreshRuntime({
      ...trial, GROWTH_DAILY_FRESH_APPROVAL: "UNAUTHORIZED",
    }, sha, identity, new Date("2026-11-07T17:00:00Z"))).toThrow();
  });
  it("refuses all broader Growth, attribution and reporting switches", () => {
    for (const key of [
      "GROWTH_WORKER_RUN_ENABLED", "GROWTH_DAILY_REPORT_SCHEDULE_ENABLED",
      "TELEGRAM_REPORTS_ENABLED", "GROWTH_ATTRIBUTION_COLLECTION_ENABLED",
    ]) {
      expect(() => assertDailyFreshRuntime({
        ...env, [key]: "true",
      }, sha, identity, new Date("2026-11-07T07:03:00Z"))).toThrow();
    }
    for (const delta of [
      { GROWTH_AI_IMAGE_ENABLED: "false" },
      { GROWTH_OPENAI_IMAGE_MODEL: "unverified-model" },
      { GROWTH_OPENAI_API_KEY: "" },
      { GROWTH_OPENAI_PROJECT_ID: "" },
    ]) expect(() => assertDailyFreshRuntime({
      ...env, ...delta,
    }, sha, identity, new Date("2026-11-07T07:03:00Z"))).toThrow();
    expect(() => assertDailyFreshRuntime({
      ...env, GROWTH_ROLLOUT_MODE: "RECOMMEND",
    }, sha, identity, new Date("2026-11-07T07:03:00Z"))).toThrow();
  });
});
