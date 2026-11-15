// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GrowthJob } from "@prisma/client";
const m = vi.hoisted(() => ({
  settings: vi.fn(),
  jobs: vi.fn(),
  accounts: vi.fn(),
  blockers: vi.fn(),
  update: vi.fn(),
  worker: vi.fn(),
  revoke: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: async (fn: (tx: unknown) => unknown) =>
      fn({
        $queryRaw: vi.fn(),
        growthSettings: { findUnique: m.settings, update: m.update },
        growthJob: { findMany: m.jobs },
        growthPinterestAccount: { findMany: m.accounts },
      }),
  },
}));
vi.mock("@/lib/growth/operations/approved-publication-queue", () => ({
  countBlockingGrowthJobs: m.blockers,
}));
vi.mock("@/lib/growth/worker", () => ({ runGrowthWorker: m.worker }));
vi.mock("@/lib/growth/settings", () => ({
  revokeGrowthWorkerActivation: m.revoke,
}));
import {
  consumeQueuedPinterestInventory,
  inventoryReadAccount,
} from "@/lib/growth/pinterest/queued-inventory";
const now = new Date("2026-11-15T01:00:00Z"),
  accountId = "cmwgfd44v000ya54wraf6ai89";
function job(overrides: Partial<GrowthJob> = {}) {
  return {
    id: "inventory-job",
    type: "PINTEREST_ACCOUNT_SYNC",
    status: "PENDING",
    createdAt: now,
    payload: { accountId },
    idempotencyKey: `pinterest:account-sync:${accountId}:${Math.floor(+now / 60000)}`,
    runAfter: now,
    attemptCount: 0,
    maxAttempts: 3,
    claimedAt: null,
    leaseUntil: null,
    heartbeatAt: null,
    workerId: null,
    completedAt: null,
    ...overrides,
  } as GrowthJob;
}
beforeEach(() => {
  vi.clearAllMocks();
  m.settings.mockResolvedValue({
    enabled: false,
    attributionEnabled: false,
    workerActivationExpiresAt: null,
  });
  m.jobs.mockResolvedValue([job()]);
  m.accounts.mockResolvedValue([
    {
      id: accountId,
      encryptedCredentials: "protected",
      grantedScopes: [
        "boards:read",
        "user_accounts:read",
        "boards:write",
        "pins:read",
        "pins:write",
      ],
      accessTokenExpiresAt: new Date(+now + 3600000),
      refreshTokenExpiresAt: null,
    },
  ]);
  m.blockers.mockResolvedValue(0);
  m.worker.mockResolvedValue({ status: "COMPLETED", succeeded: 1, failed: 0 });
});
describe("Existing inventory reads", () => {
  it("binds exact read type, payload, key, creation minute and inactive lease", () => {
    expect(inventoryReadAccount(job())).toBe(accountId);
    expect(
      inventoryReadAccount(
        job({
          status: "FAILED_RETRYABLE",
          attemptCount: 1,
          claimedAt: now,
          heartbeatAt: now,
          workerId: "previous",
        }),
      ),
    ).toBe(accountId);
    for (const change of [
      { type: "PINTEREST_PIN_PUBLISH" },
      { payload: { accountId, publish: true } },
      { idempotencyKey: "unbound" },
      { createdAt: new Date(+now - 120000) },
      { status: "RUNNING" },
      { status: "CLAIMED" },
      { workerId: "another" },
      { attemptCount: 3 },
      { leaseUntil: now },
    ] as Partial<GrowthJob>[])
      expect(inventoryReadAccount(job(change))).toBeNull();
  });
  it("claims exactly the existing ID in inventory-only mode and releases its lease", async () => {
    expect(await consumeQueuedPinterestInventory(now)).toMatchObject({
      status: "COMPLETED",
    });
    expect(m.worker).toHaveBeenCalledWith(
      expect.objectContaining({
        onlyJobId: "inventory-job",
        batchSize: 1,
        rolloutConfig: {
          GROWTH_WORKER_RUN_ENABLED: "true",
          GROWTH_ROLLOUT_MODE: "INVENTORY",
          GROWTH_INVENTORY_READ_SCOPE: "true",
        },
      }),
    );
    expect(m.blockers).toHaveBeenCalledWith(expect.anything(), [
      "inventory-job",
    ]);
    expect(m.revoke).toHaveBeenCalledWith(new Date(+now + 150000));
  });
  it("releases the activation on a worker interruption", async () => {
    m.worker.mockRejectedValueOnce(Error("interrupted"));
    await expect(consumeQueuedPinterestInventory(now)).rejects.toThrow(
      "interrupted",
    );
    expect(m.revoke).toHaveBeenCalledOnce();
  });
  it("blocks executing work, disconnected accounts and mismatched queued jobs", async () => {
    m.blockers.mockResolvedValueOnce(1);
    await consumeQueuedPinterestInventory(now);
    m.accounts.mockResolvedValueOnce([]);
    await consumeQueuedPinterestInventory(now);
    m.jobs.mockResolvedValueOnce([
      job({ payload: { accountId, unsafe: true } }),
    ]);
    await consumeQueuedPinterestInventory(now);
    m.settings.mockResolvedValueOnce({ workerActivationExpiresAt: now });
    await consumeQueuedPinterestInventory(now);
    expect(m.worker).not.toHaveBeenCalled();
    expect(m.update).not.toHaveBeenCalled();
    expect(m.revoke).not.toHaveBeenCalled();
  });
});
