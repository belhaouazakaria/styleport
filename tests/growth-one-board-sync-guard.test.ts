import { afterEach, describe, expect, it, vi } from "vitest";

import { oneBoardSyncFetch } from "@/lib/growth/pinterest/board-one-get-guard";
import { assertOneBoardSyncRuntime } from "@/workers/growth-one-board-sync";

const sha = "c".repeat(40);
const identity = { username: "saytwist", uid: 1001,
  cwd: "/home/saytwist/htdocs/saytwist.com",
  node: "/home/saytwist/.nvm/versions/node/v24.20.0/bin/node",
};
const validEnv = {
  EXPECTED_RELEASE: sha,
  GROWTH_PINTEREST_BOARD_SYNC_APPROVAL: "RUN SAYTWIST PINTEREST BOARD SYNC ONCE " + sha,
  GROWTH_PINTEREST_BOARD_SYNC_ENTRYPOINT: "true",
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://app:pass@127.0.0.1:5433/saytwist",
  GROWTH_WORKER_RUN_ENABLED: "false",
  GROWTH_ROLLOUT_MODE: "OFF",
  GROWTH_AI_IMAGE_ENABLED: "false",
  PINTEREST_API_ENVIRONMENT: "production",
  APP_BASE_URL: "https://saytwist.com",
};

describe("One bounded Pinterest board inventory read", () => {
  afterEach(() => {
    delete process.env.GROWTH_PINTEREST_BOARD_SYNC_JOB_ID;
    delete process.env.GROWTH_PINTEREST_BOARD_SYNC_ENTRYPOINT;
  });

  it("requires exact deployed SHA, admin approval, app identity and production DB", () => {
    expect(assertOneBoardSyncRuntime(validEnv, sha, identity)).toBe(sha);
    expect(() => assertOneBoardSyncRuntime(validEnv, "f".repeat(40), identity)).toThrow();
    expect(() => assertOneBoardSyncRuntime({ ...validEnv,
      GROWTH_PINTEREST_BOARD_SYNC_APPROVAL: "wrong" }, sha, identity)).toThrow();
    expect(() => assertOneBoardSyncRuntime({ ...validEnv,
      GROWTH_PINTEREST_BOARD_SYNC_ENTRYPOINT: "false" }, sha, identity)).toThrow();
    expect(() => assertOneBoardSyncRuntime(validEnv, sha,
      { ...identity, uid: 0 })).toThrow();
    for (const delta of [
      { DATABASE_URL: "postgresql://app:pass@remotehost:5433/saytwist" },
      { DATABASE_URL: "postgresql://app:pass@127.0.0.1:5433/other" },
      { GROWTH_WORKER_RUN_ENABLED: "true" },
      { GROWTH_ROLLOUT_MODE: "OBSERVE" },
      { GROWTH_DAILY_REPORT_SCHEDULE_ENABLED: "true" },
      { TELEGRAM_REPORTS_ENABLED: "true" },
      { GROWTH_ATTRIBUTION_COLLECTION_ENABLED: "true" },
      { GROWTH_AI_IMAGE_ENABLED: "true" },
      { PINTEREST_API_ENVIRONMENT: "sandbox" },
      { APP_BASE_URL: "https://other.test" },
    ]) {
      expect(() => assertOneBoardSyncRuntime(
        { ...validEnv, ...delta }, sha, identity,
      )).toThrow();
    }
  });

  it("makes precisely one official boards GET and never retries", async () => {
    process.env.GROWTH_PINTEREST_BOARD_SYNC_ENTRYPOINT = "true";
    process.env.GROWTH_PINTEREST_BOARD_SYNC_JOB_ID = "board-job";
    const transport = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      items: [{ id: "board1", name: "Styles" }],
    }), { status: 200,
      headers: { "x-ratelimit-limit": "100",
        "x-ratelimit-remaining": "99", "x-ratelimit-reset": "10" },
    }));
    const guarded = oneBoardSyncFetch("board-job", transport as typeof fetch);
    await expect(guarded("https://api.pinterest.com/v5/boards?page_size=100"))
      .resolves.toBeInstanceOf(Response);
    expect(transport).toHaveBeenCalledOnce();
    await expect(guarded("https://api.pinterest.com/v5/boards?page_size=100"))
      .rejects.toThrow();
    expect(transport).toHaveBeenCalledOnce();
  });

  it("rejects OAuth token refresh, other pages, methods, wrong job and publisher POST", async () => {
    process.env.GROWTH_PINTEREST_BOARD_SYNC_ENTRYPOINT = "true";
    process.env.GROWTH_PINTEREST_BOARD_SYNC_JOB_ID = "board-job";
    const transport = vi.fn();
    expect(() => oneBoardSyncFetch("another-job", transport as typeof fetch)).toThrow();
    const guarded = oneBoardSyncFetch("board-job", transport as typeof fetch);
    for (const url of [
      "https://api.pinterest.com/v5/oauth/token",
      "https://api.pinterest.com/v5/user_account",
      "https://api.pinterest.com/v5/boards?page_size=100&bookmark=abc",
      "https://api.pinterest.com/v5/pins",
      "https://api.pinterest.com/v5/boards?page_size=200",
      "https://evil.example/v5/boards?page_size=100",
    ]) {
      await expect(guarded(url)).rejects.toThrow();
    }
    await expect(guarded("https://api.pinterest.com/v5/boards?page_size=100",
      { method: "POST" })).rejects.toThrow();
    expect(transport).not.toHaveBeenCalled();
  });

  it("stops after 429 or transport timeout without a second attempt", async () => {
    process.env.GROWTH_PINTEREST_BOARD_SYNC_ENTRYPOINT = "true";
    process.env.GROWTH_PINTEREST_BOARD_SYNC_JOB_ID = "board-job";
    const limited = vi.fn().mockResolvedValue(new Response("{}", { status: 429 }));
    const once = oneBoardSyncFetch("board-job", limited as typeof fetch);
    await expect(once("https://api.pinterest.com/v5/boards?page_size=100")).rejects.toThrow();
    await expect(once("https://api.pinterest.com/v5/boards?page_size=100")).rejects.toThrow();
    expect(limited).toHaveBeenCalledOnce();

    const offline = vi.fn().mockRejectedValue(Error("timeout"));
    const failed = oneBoardSyncFetch("board-job", offline as typeof fetch);
    await expect(failed("https://api.pinterest.com/v5/boards?page_size=100")).rejects.toThrow();
    await expect(failed("https://api.pinterest.com/v5/boards?page_size=100")).rejects.toThrow();
    expect(offline).toHaveBeenCalledOnce();
  });
});
