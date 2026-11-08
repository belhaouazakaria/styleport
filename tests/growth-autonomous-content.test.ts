import {
  GrowthOpportunityDestinationKind as Destination,
} from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  assertAutonomousContentRuntime, planContentOpportunities,
} from "@/workers/growth-autonomous-content";

const sha = "a".repeat(40);
const identity = {
  username: "saytwist", uid: 1001,
  cwd: "/home/saytwist/htdocs/saytwist.com",
  node: "/home/saytwist/.nvm/versions/node/v24.20.0/bin/node",
};
const env = {
  EXPECTED_RELEASE: sha, NODE_ENV: "production",
  GROWTH_AUTONOMOUS_CONTENT_DATE: "2026-11-04",
  GROWTH_AUTONOMOUS_CONTENT_ENABLED: "true",
  GROWTH_AUTONOMOUS_CONTENT_APPROVAL: "SAYTWIST_CONTENT_PREPARATION:" + sha,
  DATABASE_URL: "postgresql://user:pass@127.0.0.1:5433/saytwist",
  GROWTH_WORKER_RUN_ENABLED: "false", GROWTH_ROLLOUT_MODE: "OFF",
};

describe("autonomous content only from qualified original opportunities", () => {
  it("selects a maximum of one translator and one genuinely distinct Idea target", () => {
    const chosen = planContentOpportunities([
      { id: "too-low", score: 68, confidence: 90, targetDestinationKind: Destination.FUTURE_IDEAS },
      { id: "valid-idea", score: 73, confidence: 80, targetDestinationKind: Destination.FUTURE_IDEAS },
      { id: "other-idea", score: 71, confidence: 90, targetDestinationKind: Destination.FUTURE_IDEAS },
      { id: "valid-translator", score: 93, confidence: 88, targetDestinationKind: Destination.TRANSLATOR },
      { id: "too-uncertain", score: 95, confidence: 70, targetDestinationKind: Destination.TRANSLATOR },
      { id: "unknown", score: 99, confidence: 99, targetDestinationKind: Destination.UNKNOWN },
    ]);
    expect(chosen).toEqual([
      { id: "valid-translator", kind: "TRANSLATOR" },
      { id: "valid-idea", kind: "IDEA" },
    ]);
    expect(planContentOpportunities([])).toEqual([]);
    expect(planContentOpportunities([
      { id: "partial", score: 45, confidence: 40, targetDestinationKind: Destination.TRANSLATOR },
    ])).toEqual([]);
  });

  it("enforces owner cadence selection limits without loosening the content caps", () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({
      id: "translator-" + i, score: 95 - i, confidence: 90,
      targetDestinationKind: Destination.TRANSLATOR,
    }));
    expect(planContentOpportunities(rows, { translator: 0, idea: 1 })).toEqual([]);
    expect(planContentOpportunities(rows, { translator: 3, idea: 0 }))
      .toEqual([0, 1, 2].map(i => ({ id: "translator-" + i, kind: "TRANSLATOR" })));
    expect(planContentOpportunities(rows, { translator: 10, idea: 0 }))
      .toHaveLength(10);
    expect(() => planContentOpportunities(rows, { translator: 11, idea: 0 }))
      .toThrow("CONTENT_CADENCE_LIMIT_INVALID");
    expect(() => planContentOpportunities(rows, { translator: -1, idea: 0 }))
      .toThrow("CONTENT_CADENCE_LIMIT_INVALID");
  });

  it("refuses unauthorized paid work or a wrong runtime/release/date", () => {
    const now = new Date("2026-11-04T06:30:15Z");
    expect(assertAutonomousContentRuntime(env, sha, identity, now))
      .toEqual({ sha, day: "2026-11-04" });
    for (const props of [
      { GROWTH_AUTONOMOUS_CONTENT_ENABLED: "false" },
      { GROWTH_AUTONOMOUS_CONTENT_APPROVAL: "wrong" },
      { GROWTH_WORKER_RUN_ENABLED: "true" },
      { GROWTH_DAILY_REPORT_SCHEDULE_ENABLED: "true" },
      { GROWTH_ROLLOUT_MODE: "PREPARE" },
    ]) {
      expect(() => assertAutonomousContentRuntime({ ...env, ...props },
        sha, identity, now)).toThrow();
    }
    expect(() => assertAutonomousContentRuntime(env, "b".repeat(40), identity, now)).toThrow();
    expect(() => assertAutonomousContentRuntime(env, sha, { ...identity, uid: 0 }, now)).toThrow();
    expect(() => assertAutonomousContentRuntime(env, sha, identity,
      new Date("2026-11-04T06:50:00Z"))).toThrow();
    expect(() => assertAutonomousContentRuntime({ ...env,
      DATABASE_URL: "postgresql://u:p@localhost:5433/saytwist",
    }, sha, identity, now)).toThrow();
  });
});
