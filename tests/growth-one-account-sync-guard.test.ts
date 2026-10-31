import { afterEach, describe, expect, it, vi } from "vitest";

import { assertOneSyncRuntime } from "@/workers/growth-one-account-sync";
import { oneAccountSyncFetch } from "@/lib/growth/pinterest/one-sync-guard";

const sha = "b".repeat(40);
const validEnv = {
  EXPECTED_RELEASE: sha, NODE_ENV: "production",
  GROWTH_PINTEREST_ONE_SYNC_APPROVAL: "RUN SAYTWIST GROWTH ONE ACCOUNT SYNC " + sha,
  DATABASE_URL: "postgresql://user:password@127.0.0.1:5433/saytwist",
  GROWTH_WORKER_RUN_ENABLED: "false", GROWTH_ROLLOUT_MODE: "OFF",
};
const identity = {
  username: "saytwist", uid: 1001, cwd: "/home/saytwist/htdocs/saytwist.com",
  node: "/home/saytwist/.nvm/versions/node/v24.20.0/bin/node",
};

describe("Phase14E guarded worker process", () => {
  it("requires exact release, authorization, service account, production DB and disabled automation", () => {
    expect(assertOneSyncRuntime(validEnv, sha, identity)).toBe(sha);
    expect(() => assertOneSyncRuntime(validEnv, "a".repeat(40), identity)).toThrow();
    expect(() => assertOneSyncRuntime({ ...validEnv,
      GROWTH_PINTEREST_ONE_SYNC_APPROVAL: "" }, sha, identity)).toThrow();
    expect(() => assertOneSyncRuntime(validEnv, sha, { ...identity, uid: 0 })).toThrow();
    expect(() => assertOneSyncRuntime({ ...validEnv,
      DATABASE_URL: "postgresql://user:password@otherhost:5433/saytwist" },
      sha, identity)).toThrow();
    for (const flag of ["GROWTH_WORKER_RUN_ENABLED",
      "GROWTH_DAILY_REPORT_SCHEDULE_ENABLED", "TELEGRAM_REPORTS_ENABLED",
      "GROWTH_ATTRIBUTION_COLLECTION_ENABLED"]) {
      expect(() => assertOneSyncRuntime({ ...validEnv, [flag]: "true" }, sha, identity)).toThrow();
    }
    expect(() => assertOneSyncRuntime({ ...validEnv,
      GROWTH_ROLLOUT_MODE: "RECOMMEND" }, sha, identity)).toThrow();
  });
});

describe("Phase14E single network request limiter", () => {
  afterEach(() => { delete process.env.GROWTH_PINTEREST_ONE_SYNC_JOB_ID; });
  it("makes one GET to the approved endpoint, never a second GET", async () => {
    process.env.GROWTH_PINTEREST_ONE_SYNC_JOB_ID = "job123";
    const transport = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "123" }), {
      status: 200, headers: { "x-ratelimit-limit": "100", "x-ratelimit-remaining": "99",
        "x-ratelimit-reset": "1" },
    }));
    const guarded = oneAccountSyncFetch("job123", transport as typeof fetch);
    await expect(guarded("https://api.pinterest.com/v5/user_account")).resolves.toBeInstanceOf(Response);
    expect(transport).toHaveBeenCalledTimes(1);
    await expect(guarded("https://api.pinterest.com/v5/user_account")).rejects.toThrow();
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it("rejects token refresh, wrong method and scope without network calls", async () => {
    process.env.GROWTH_PINTEREST_ONE_SYNC_JOB_ID = "job123";
    const transport = vi.fn();
    expect(() => oneAccountSyncFetch("otherjob", transport as typeof fetch)).toThrow();
    const guarded = oneAccountSyncFetch("job123", transport as typeof fetch);
    await expect(guarded("https://api.pinterest.com/v5/oauth/token")).rejects.toThrow();
    await expect(guarded("https://api.pinterest.com/v5/user_account", { method: "POST" })).rejects.toThrow();
    expect(transport).not.toHaveBeenCalled();
  });
  it("does not retry 429, malformed quota evidence or network timeouts", async () => {
    process.env.GROWTH_PINTEREST_ONE_SYNC_JOB_ID = "job123";
    const transport = vi.fn().mockResolvedValue(new Response("{}", { status: 429 }));
    const guarded = oneAccountSyncFetch("job123", transport as typeof fetch);
    await expect(guarded("https://api.pinterest.com/v5/user_account")).rejects.toThrow();
    await expect(guarded("https://api.pinterest.com/v5/user_account")).rejects.toThrow();
    expect(transport).toHaveBeenCalledTimes(1);

    const invalid = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    const bad = oneAccountSyncFetch("job123", invalid as typeof fetch);
    await expect(bad("https://api.pinterest.com/v5/user_account")).rejects.toThrow();
    expect(invalid).toHaveBeenCalledTimes(1);

    const timedOut = vi.fn().mockRejectedValue(Error("offline"));
    const guardTimeout = oneAccountSyncFetch("job123", timedOut as typeof fetch);
    await expect(guardTimeout("https://api.pinterest.com/v5/user_account")).rejects.toThrow();
    await expect(guardTimeout("https://api.pinterest.com/v5/user_account")).rejects.toThrow();
    expect(timedOut).toHaveBeenCalledTimes(1);
  });
});
