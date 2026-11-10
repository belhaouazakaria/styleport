import { describe, expect, it } from "vitest";
import { assertViralDiscoveryRuntime } from "@/workers/growth-viral-discovery";

const sha = "a".repeat(40);
const identity = {
  username: "saytwist", uid: 1001,
  cwd: "/home/saytwist/htdocs/saytwist.com",
  node: "/home/saytwist/.nvm/versions/node/v24.20.0/bin/node",
};
const env = {
  NODE_ENV: "production", EXPECTED_RELEASE: sha,
  GROWTH_VIRAL_DISCOVERY_ENTRYPOINT: "true",
  GROWTH_VIRAL_DISCOVERY_ENABLED: "true",
  GROWTH_VIRAL_DISCOVERY_APPROVAL: "SAYTWIST_VIRAL_DISCOVERY:" + sha,
  GROWTH_VIRAL_DISCOVERY_DATE: "2026-11-10",
  DATABASE_URL: "postgresql://app:secret@127.0.0.1:5433/saytwist",
  GROWTH_WORKER_RUN_ENABLED: "false",
  GROWTH_ROLLOUT_MODE: "OFF",
  GROWTH_AI_IMAGE_ENABLED: "false",
  GROWTH_ATTRIBUTION_COLLECTION_ENABLED: "false",
  TELEGRAM_REPORTS_ENABLED: "false",
  GROWTH_DAILY_REPORT_SCHEDULE_ENABLED: "false",
};
const now = new Date("2026-11-10T08:15:05Z");

describe("scheduled viral review-only catalog discovery", () => {
  it("requires the reviewed SHA, dedicated approval, identity and UTC window", () => {
    expect(assertViralDiscoveryRuntime(env, sha, identity, now)).toEqual({
      sha, day: "2026-11-10",
    });
    expect(() => assertViralDiscoveryRuntime(env, "b".repeat(40), identity, now))
      .toThrow("DISCOVERY_RELEASE_OR_WINDOW_INVALID");
    expect(() => assertViralDiscoveryRuntime({ ...env,
      GROWTH_VIRAL_DISCOVERY_APPROVAL: "wrong",
    }, sha, identity, now)).toThrow();
    expect(() => assertViralDiscoveryRuntime({ ...env,
      GROWTH_VIRAL_DISCOVERY_DATE: "2026-11-09",
    }, sha, identity, now)).toThrow();
    expect(() => assertViralDiscoveryRuntime(env, sha, {
      ...identity, uid: 0,
    }, now)).toThrow("DISCOVERY_IDENTITY_INVALID");
  });
  it("refuses other time windows and global Growth flags", () => {
    for (const date of [
      "2026-11-10T08:14:59Z", "2026-11-10T08:30:00Z",
      "2026-11-11T08:16:00Z",
    ]) expect(() => assertViralDiscoveryRuntime(env, sha, identity,
      new Date(date))).toThrow();
    for (const [key, value] of [
      ["GROWTH_WORKER_RUN_ENABLED", "true"],
      ["GROWTH_ROLLOUT_MODE", "OBSERVE"],
      ["GROWTH_AI_IMAGE_ENABLED", "true"],
      ["GROWTH_ATTRIBUTION_COLLECTION_ENABLED", "true"],
      ["TELEGRAM_REPORTS_ENABLED", "true"],
      ["GROWTH_DAILY_REPORT_SCHEDULE_ENABLED", "true"],
    ] as const) expect(() => assertViralDiscoveryRuntime({
      ...env, [key]: value,
    }, sha, identity, now)).toThrow("DISCOVERY_CONFLICTING_AUTOMATION");
    expect(() => assertViralDiscoveryRuntime({ ...env,
      DATABASE_URL: "postgresql://app:secret@other:5433/saytwist",
    }, sha, identity, now)).toThrow("DISCOVERY_DATABASE_INVALID");
  });
});
