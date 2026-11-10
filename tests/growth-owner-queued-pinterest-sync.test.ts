import { describe, expect, it } from "vitest";
import { GrowthJobStatus, GrowthJobType } from "@prisma/client";
import { selectOwnerQueuedPinterestSync } from "@/lib/growth/pinterest/owner-queued-sync";
import { assertOwnerPendingSyncRuntime } from "@/workers/growth-owner-queued-pinterest-sync";

const accountId = "account1234567890";
const runAfter = new Date("2026-11-09T22:47:42.733Z");
const minute = Math.floor(runAfter.getTime() / 60_000);
const job = (kind: "account" | "board") => ({
  id: kind + "-job",
  type: kind === "board" ? GrowthJobType.PINTEREST_BOARD_SYNC :
    GrowthJobType.PINTEREST_ACCOUNT_SYNC,
  status: GrowthJobStatus.PENDING,
  idempotencyKey: "pinterest:" + kind + "-sync:" + accountId + ":" + minute,
  payload: { accountId }, runAfter,
  attemptCount: 0, maxAttempts: 3,
  workerId: null, claimedAt: null, leaseUntil: null, heartbeatAt: null,
  completedAt: null, lastError: null,
});

describe("honor both ORIGINAL pending owner Pinterest jobs, never replace them", () => {
  it("takes exact board first, then exact account", () => {
    const board = selectOwnerQueuedPinterestSync([job("account"), job("board")], "BOARD");
    expect(board).toMatchObject({
      jobId: "board-job", accountId, remaining: 2,
    });
    const account = selectOwnerQueuedPinterestSync([job("account")], "ACCOUNT");
    expect(account).toMatchObject({
      jobId: "account-job", accountId, remaining: 1,
    });
  });
  it("rejects any third or unrelated job, changed account, claim, time or retries", () => {
    const base = [job("board"), job("account")];
    const corrupt = [
      [...base, job("board")],
      [{ ...base[0], attemptCount: 1 }, base[1]],
      [{ ...base[0], workerId: "stranger" }, base[1]],
      [{ ...base[0], runAfter: new Date("2026-11-10T22:47:42Z") }, base[1]],
      [{ ...base[0], payload: { accountId: "someoneelse" } }, base[1]],
      [{ ...base[0], status: GrowthJobStatus.FAILED_RETRYABLE }, base[1]],
      [{ ...base[0], type: GrowthJobType.PINTEREST_PIN_PUBLISH }, base[1]],
      [{ ...base[0], payload: { accountId, more: true } }, base[1]],
      [base[0], { ...base[1], runAfter: new Date("2026-11-09T22:48:42.733Z") }],
    ];
    for (const pair of corrupt) {
      expect(() => selectOwnerQueuedPinterestSync(pair, "BOARD")).toThrow();
    }
    expect(() => selectOwnerQueuedPinterestSync([base[0]], "ACCOUNT")).toThrow();
  });
  it("validates deployment identity and owner approval before DB imports", () => {
    const sha = "a".repeat(40);
    const env = {
      EXPECTED_RELEASE: sha, NODE_ENV: "production",
      GROWTH_OWNER_QUEUED_SYNC_ENTRYPOINT: "true",
      GROWTH_OWNER_QUEUED_SYNC_APPROVAL: "SAYTWIST_COMPLETE_TWO_QUEUED_SYNCS:" + sha,
      GROWTH_WORKER_RUN_ENABLED: "false", GROWTH_ROLLOUT_MODE: "OFF",
      GROWTH_AI_IMAGE_ENABLED: "false",
      GROWTH_ATTRIBUTION_COLLECTION_ENABLED: "false",
      TELEGRAM_REPORTS_ENABLED: "false",
      GROWTH_DAILY_REPORT_SCHEDULE_ENABLED: "false",
      PINTEREST_API_ENVIRONMENT: "production",
      DATABASE_URL: "postgresql://user:pass@127.0.0.1:5433/saytwist",
    };
    const id = {
      username: "saytwist", uid: 1001,
      cwd: "/home/saytwist/htdocs/saytwist.com",
      node: "/home/saytwist/.nvm/versions/node/v24.20.0/bin/node",
    };
    expect(assertOwnerPendingSyncRuntime(env, sha, id)).toBe(sha);
    for (const changed of [
      { EXPECTED_RELEASE: "b".repeat(40) },
      { GROWTH_WORKER_RUN_ENABLED: "true" },
      { GROWTH_AI_IMAGE_ENABLED: "true" },
      { GROWTH_ROLLOUT_MODE: "OBSERVE" },
      { DATABASE_URL: "postgresql://u:p@external:5433/saytwist" },
      { GROWTH_OWNER_QUEUED_SYNC_APPROVAL: "wrong" },
    ]) expect(() => assertOwnerPendingSyncRuntime({
      ...env, ...changed,
    }, sha, id)).toThrow();
    expect(() => assertOwnerPendingSyncRuntime(env, sha,
      { ...id, uid: 0 })).toThrow();
  });
});
