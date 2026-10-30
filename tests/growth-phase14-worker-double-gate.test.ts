import { beforeEach, describe, expect, it, vi } from "vitest";
import { GrowthJobType } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  settings: vi.fn(async () => ({ enabled: false, workerBatchSize: 5, workerActivationExpiresAt: null as Date | null })),
  heartbeatUpsert: vi.fn(async () => ({})),
  heartbeatUpdate: vi.fn(async () => ({ count: 1 })),
  promote: vi.fn(async (_now?: unknown, _limit?: unknown, _allowed?: GrowthJobType[]) => 0),
  recover: vi.fn(async (_now?: unknown, _limit?: unknown, _allowed?: GrowthJobType[]) => 0),
  claim: vi.fn(async (_opts?: { allowedTypes?: GrowthJobType[] }) => [] as Array<{ id: string; type: GrowthJobType }>),
  release: vi.fn(async () => ({})),
  markRunning: vi.fn(async () => ({})),
  dispatch: vi.fn(async () => ({})),
  complete: vi.fn(async () => ({})),
  fail: vi.fn(async () => ({})),
}));

vi.mock("@/lib/growth/settings", () => ({
  getGrowthSettings: mocks.settings,
  revokeGrowthWorkerActivation: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { growthWorkerHeartbeat: {
    upsert: mocks.heartbeatUpsert, updateMany: mocks.heartbeatUpdate,
  } },
}));
vi.mock("@/lib/growth/jobs", () => ({
  promoteDueGrowthRetries: mocks.promote,
  recoverStaleGrowthJobs: mocks.recover,
  claimGrowthJobs: mocks.claim,
  releaseClaimedGrowthJob: mocks.release,
  markGrowthJobRunning: mocks.markRunning,
  completeGrowthJob: mocks.complete,
  failGrowthJob: mocks.fail,
}));
vi.mock("@/lib/growth/handlers", () => ({ dispatchGrowthJob: mocks.dispatch }));

import { runGrowthWorker } from "@/lib/growth/worker";

const observe = { GROWTH_WORKER_RUN_ENABLED: "true", GROWTH_ROLLOUT_MODE: "OBSERVE" };
const blocked = { GROWTH_WORKER_RUN_ENABLED: "false", GROWTH_ROLLOUT_MODE: "OBSERVE" };

describe("Phase 14 worker double gates and forbidden job defense", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.settings.mockImplementation(async () => ({ enabled: false, workerBatchSize: 5, workerActivationExpiresAt: null }));
    mocks.claim.mockImplementation(async () => []);
  });

  it("does not even read DB settings when the process flag is OFF", async () => {
    expect(await runGrowthWorker({ rolloutConfig: blocked, batchSize: 1 }))
      .toEqual({ status: "DISABLED", claimed: 0, succeeded: 0, failed: 0 });
    expect(mocks.settings).not.toHaveBeenCalled();
    expect(mocks.claim).not.toHaveBeenCalled();
    expect(mocks.heartbeatUpsert).not.toHaveBeenCalled();
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });

  it("does not claim, retry or dispatch when the persistent DB switch is OFF", async () => {
    expect(await runGrowthWorker({ rolloutConfig: observe, batchSize: 1 }))
      .toEqual({ status: "DISABLED", claimed: 0, succeeded: 0, failed: 0 });
    expect(mocks.settings).toHaveBeenCalledTimes(1);
    for (const fn of [mocks.promote, mocks.recover, mocks.claim, mocks.heartbeatUpsert, mocks.dispatch]) {
      expect(fn).not.toHaveBeenCalled();
    }
  });

  it("only passes OBSERVE allowlists into all three queue operations", async () => {
    const expiresAt = new Date(Date.now() + 120_000);
    mocks.settings.mockImplementation(async () => ({ enabled: true, workerBatchSize: 5, workerActivationExpiresAt: expiresAt }));
    expect(await runGrowthWorker({ rolloutConfig: observe, batchSize: 1 }))
      .toEqual({ status: "EMPTY", claimed: 0, succeeded: 0, failed: 0 });
    const allowlist = mocks.claim.mock.calls[0]?.[0]?.allowedTypes as GrowthJobType[];
    expect(allowlist).toContain(GrowthJobType.PINTEREST_ACCOUNT_SYNC);
    for (const forbidden of [
      GrowthJobType.PINTEREST_PIN_PUBLISH,
      GrowthJobType.PINTEREST_ANALYTICS_GAP_RECOVERY,
      GrowthJobType.CREATIVE_LAB_GENERATE,
      GrowthJobType.IDEA_AUTOPILOT_EXECUTE,
      GrowthJobType.TRANSLATOR_AUTOPILOT_EXECUTE,
    ]) expect(allowlist).not.toContain(forbidden);
    expect(mocks.promote.mock.calls[0]?.[2]).toEqual(allowlist);
    expect(mocks.recover.mock.calls[0]?.[2]).toEqual(allowlist);
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });

  it("releases a forbidden claimed job without dispatch even if a queue layer regresses", async () => {
    const expiresAt = new Date(Date.now() + 120_000);
    mocks.settings.mockImplementation(async () => ({ enabled: true, workerBatchSize: 5, workerActivationExpiresAt: expiresAt }));
    mocks.claim.mockImplementation(async () => [{ id: "forbidden", type: GrowthJobType.PINTEREST_PIN_PUBLISH }]);
    expect(await runGrowthWorker({ rolloutConfig: observe, batchSize: 1 }))
      .toEqual({ status: "COMPLETED", claimed: 1, succeeded: 0, failed: 0 });
    expect(mocks.release).toHaveBeenCalledTimes(1);
    expect(mocks.dispatch).not.toHaveBeenCalled();
    expect(mocks.markRunning).not.toHaveBeenCalled();
  });
});
