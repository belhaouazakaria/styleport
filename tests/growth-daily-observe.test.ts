import { describe, expect, it } from "vitest";
import { assertDailyObserveRuntime } from "@/workers/growth-daily-observe";
import { runOneAccountSync } from "@/workers/growth-one-account-sync";

const sha = "a".repeat(40);
const day = "2026-11-04";
const trialTime = new Date("2026-11-04T21:15:00Z");
const scheduledTime = new Date("2026-11-04T23:55:00Z");
const identity = {
  username: "saytwist", uid: 1001,
  cwd: "/home/saytwist/htdocs/saytwist.com",
  node: "/home/saytwist/.nvm/versions/node/v24.20.0/bin/node",
};
const config = {
  EXPECTED_RELEASE: sha, NODE_ENV: "production",
  DATABASE_URL: "postgresql://user:password@127.0.0.1:5433/saytwist",
  GROWTH_DAILY_OBSERVE_MODE: "TRIAL",
  GROWTH_DAILY_OBSERVE_DATE: day,
  GROWTH_DAILY_OBSERVE_APPROVAL: "RUN SAYTWIST GROWTH DAILY OBSERVE TRIAL " + sha,
  GROWTH_WORKER_RUN_ENABLED: "false", GROWTH_ROLLOUT_MODE: "OFF",
};

describe("Phase14G exact daily OBSERVE runtime", () => {
  it("accepts a single approved trial on the correct release and UTC day", () => {
    expect(assertDailyObserveRuntime(config, sha, identity, trialTime)).toEqual({
      sha, day, mode: "TRIAL",
    });
  });
  it("rejects release mismatch, untrusted user and production database", () => {
    expect(() => assertDailyObserveRuntime(config, "b".repeat(40), identity, trialTime)).toThrow();
    expect(() => assertDailyObserveRuntime(config, sha, { ...identity, uid: 0 }, trialTime)).toThrow();
    expect(() => assertDailyObserveRuntime({ ...config,
      DATABASE_URL: "postgresql://user:pass@localhost:5433/saytwist",
    }, sha, identity, trialTime)).toThrow();
  });
  it("rejects old days, unapproved modes and all other Growth switches", () => {
    expect(() => assertDailyObserveRuntime({ ...config,
      GROWTH_DAILY_OBSERVE_DATE: "2026-11-03",
    }, sha, identity, trialTime)).toThrow();
    expect(() => assertDailyObserveRuntime({ ...config,
      GROWTH_DAILY_OBSERVE_APPROVAL: "wrong",
    }, sha, identity, trialTime)).toThrow();
    for (const flag of ["GROWTH_WORKER_RUN_ENABLED",
      "GROWTH_DAILY_REPORT_SCHEDULE_ENABLED", "TELEGRAM_REPORTS_ENABLED",
      "GROWTH_ATTRIBUTION_COLLECTION_ENABLED"]) {
      expect(() => assertDailyObserveRuntime({
        ...config, [flag]: "true",
      }, sha, identity, trialTime)).toThrow();
    }
  });
  it("permits scheduled mode only in the fixed 23:50-24:00 UTC window", () => {
    const schedule = { ...config,
      GROWTH_DAILY_OBSERVE_MODE: "SCHEDULED",
      GROWTH_DAILY_OBSERVE_APPROVAL: "SAYTWIST_DAILY_OBSERVE_SCHEDULED:" + sha,
    };
    expect(assertDailyObserveRuntime(schedule, sha, identity, scheduledTime).mode).toBe("SCHEDULED");
    expect(() => assertDailyObserveRuntime(schedule, sha, identity, trialTime)).toThrow();
    expect(() => assertDailyObserveRuntime(schedule, sha, identity, new Date("2026-11-04T23:49:59Z"))).toThrow();
    expect(() => assertDailyObserveRuntime(schedule, sha, identity, new Date("2026-11-05T00:00:00Z"))).toThrow();
  });
  it("rejects an old daily key before querying the production database", async () => {
    await expect(runOneAccountSync(sha, { dailyUtcDate: "2000-01-01" }))
      .rejects.toThrow("DAILY_OBSERVE_DATE_INVALID");
  });
});
