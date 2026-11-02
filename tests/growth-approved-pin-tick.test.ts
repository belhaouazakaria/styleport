import { GrowthJobStatus, GrowthJobType } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: { growthPinPublication: { findMany: mock.findMany } },
}));

import {
  assertApprovedPublishRuntime, selectDueApprovedPin,
} from "@/workers/growth-approved-pin-tick";

const sha = "a".repeat(40);
const identity = {
  username: "saytwist", uid: 1001,
  cwd: "/home/saytwist/htdocs/saytwist.com",
  node: "/home/saytwist/.nvm/versions/node/v24.20.0/bin/node",
};
const env = {
  NODE_ENV: "production", EXPECTED_RELEASE: sha,
  GROWTH_APPROVED_PUBLISH_ENABLED: "true",
  GROWTH_APPROVED_PUBLISH_APPROVAL: "SAYTWIST_APPROVED_PIN_TIMER:" + sha,
  DATABASE_URL: "postgresql://user:pass@127.0.0.1:5433/saytwist",
  GROWTH_WORKER_RUN_ENABLED: "false", GROWTH_ROLLOUT_MODE: "OFF",
};

describe("strictly approved scheduled Pin publisher", () => {
  beforeEach(() => mock.findMany.mockReset());

  it("requires exact release, opt-in approval and production identity", () => {
    expect(assertApprovedPublishRuntime(env, sha, identity)).toBe(sha);
    expect(() => assertApprovedPublishRuntime({ ...env,
      GROWTH_APPROVED_PUBLISH_ENABLED: "false" }, sha, identity)).toThrow();
    expect(() => assertApprovedPublishRuntime({ ...env,
      GROWTH_APPROVED_PUBLISH_APPROVAL: "wrong" }, sha, identity)).toThrow();
    expect(() => assertApprovedPublishRuntime(env, "b".repeat(40), identity)).toThrow();
    expect(() => assertApprovedPublishRuntime(env, sha,
      { ...identity, uid: 0 })).toThrow();
    expect(() => assertApprovedPublishRuntime({ ...env,
      GROWTH_WORKER_RUN_ENABLED: "true" }, sha, identity)).toThrow();
    expect(() => assertApprovedPublishRuntime({ ...env,
      DATABASE_URL: "postgresql://user:pass@localhost:5433/saytwist",
    }, sha, identity)).toThrow();
  });

  it("selects only jobs with matching stored publisher type and an expired due time", async () => {
    const now = new Date("2026-11-04T18:00:00Z");
    const previous = new Date("2026-11-04T17:00:00Z");
    mock.findMany.mockResolvedValueOnce([
      { id: "invalid", publishJobId: "j1", publishJob: { id: "j1",
        type: GrowthJobType.ACCOUNT_STRATEGY_REVIEW,
        status: GrowthJobStatus.PENDING, runAfter: previous } },
      { id: "future", publishJobId: "j2", publishJob: { id: "j2",
        type: GrowthJobType.PINTEREST_PIN_PUBLISH,
        status: GrowthJobStatus.PENDING, runAfter: new Date("2026-11-04T19:00:00Z") } },
      { id: "approved", publishJobId: "j3", publishJob: { id: "j3",
        type: GrowthJobType.PINTEREST_PIN_PUBLISH,
        status: GrowthJobStatus.PENDING, runAfter: previous } },
    ]);
    const result = await selectDueApprovedPin(now);
    expect(result?.id).toBe("approved");
    expect(mock.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ scheduledAt: { lte: now },
        approval: { status: "APPROVED" } }),
      take: 25,
    }));
  });

  it("does nothing when no individually approved Pin is due", async () => {
    mock.findMany.mockResolvedValue([]);
    await expect(selectDueApprovedPin()).resolves.toBeNull();
  });
});
