import { describe, expect, it, vi, beforeEach } from "vitest";
import { GrowthJobStatus, GrowthJobType, Prisma } from "@prisma/client";

const m = vi.hoisted(() => ({
  audit: vi.fn(), count: vi.fn(), lock: vi.fn(),
  transaction: vi.fn(), settings: vi.fn(), jobs: vi.fn(), accounts: vi.fn(),
  update: vi.fn(), create: vi.fn(), jobRead: vi.fn(), accountRead: vi.fn(),
  revoke: vi.fn(), run: vi.fn(),
}));
vi.mock("@/lib/growth/activity", () => ({ recordGrowthActivity: m.audit }));
vi.mock("@/lib/growth/settings", () => ({ revokeGrowthWorkerActivation: m.revoke }));
vi.mock("@/lib/growth/worker", () => ({ runGrowthWorker: m.run }));
vi.mock("@/lib/prisma", () => ({ prisma: {
  $transaction: m.transaction,
  growthSettings: { findUnique: m.settings },
  growthJob: { findUnique: m.jobRead, count: m.jobs },
  growthPinterestAccount: { findUnique: m.accountRead },
} }));

import { reserveOneAccountSyncRequest } from "@/lib/growth/pinterest/one-sync-guard";
import { runOneAccountSync } from "@/workers/growth-one-account-sync";

const sha = "c".repeat(40);

describe("Durable one-account request reservation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    m.lock.mockResolvedValue([{ id: "account123" }]);
    m.count.mockResolvedValue(0);
    m.audit.mockResolvedValue({});
  });
  const tx = () => ({ $queryRaw: m.lock,
    growthActivity: { count: m.count } }) as unknown as Prisma.TransactionClient;

  it("locks the account row and creates durable pre-call evidence", async () => {
    await reserveOneAccountSyncRequest(tx(), "account123", "trial:123");
    expect(m.lock).toHaveBeenCalledTimes(1);
    expect(m.count).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        entityId: "account123", action: "PINTEREST_ONE_SYNC_API_REQUEST_RESERVED",
      }),
    }));
    expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({
      action: "PINTEREST_ONE_SYNC_API_REQUEST_RESERVED",
      correlationKey: "trial:123",
    }), expect.anything());
  });
  it("blocks repeat requests in 24h and missing accounts before any network operation", async () => {
    m.count.mockResolvedValue(1);
    await expect(reserveOneAccountSyncRequest(tx(), "account123", "trial:123"))
      .rejects.toThrow("PINTEREST_ONE_SYNC_24H_BUDGET_EXHAUSTED");
    expect(m.audit).not.toHaveBeenCalled();
    m.lock.mockResolvedValue([]);
    await expect(reserveOneAccountSyncRequest(tx(), "unknown", "trial:123"))
      .rejects.toThrow("PINTEREST_ACCOUNT_NOT_FOUND");
  });
});

describe("One controlled Pinterest worker job", () => {
  let enabled = false;
  let lease: Date | null = null;
  let active = 0;
  let status: GrowthJobStatus;
  beforeEach(() => {
    vi.resetAllMocks();
    enabled = false; lease = null; active = 0; status = GrowthJobStatus.PENDING;
    m.audit.mockResolvedValue({});
    m.lock.mockResolvedValue([{ id: "account123" }]);
    m.count.mockResolvedValue(0);
    m.settings.mockImplementation(async () => ({
      enabled, attributionEnabled: false, workerActivationExpiresAt: lease,
    }));
    m.jobs.mockImplementation(async () => active);
    m.accounts.mockImplementation(async () => [{
      id: "account123", encryptedCredentials: "opaque",
      grantedScopes: ["user_accounts:read"],
      accessTokenExpiresAt: new Date(Date.now() + 3600_000),
      refreshTokenExpiresAt: new Date(Date.now() + 3600_000),
    }]);
    m.update.mockImplementation(async ({ data }: { data: { workerActivationExpiresAt: Date } }) => {
      enabled = true; lease = data.workerActivationExpiresAt;
      return { count: 1 };
    });
    m.create.mockImplementation(async () => { active = 1; return { id: "job123" }; });
    m.transaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb({
      growthSettings: { findUnique: m.settings, updateMany: m.update },
      growthJob: { count: m.jobs, create: m.create },
      growthPinterestAccount: { findMany: m.accounts },
      growthActivity: { count: m.count },
      $queryRaw: m.lock,
    }));
    m.revoke.mockImplementation(async () => { enabled = false; lease = null; return 1; });
    m.run.mockImplementation(async () => {
      status = GrowthJobStatus.SUCCEEDED; active = 0;
      return { status: "COMPLETED", claimed: 1, succeeded: 1, failed: 0 };
    });
    m.jobRead.mockImplementation(async () => ({ type: GrowthJobType.PINTEREST_ACCOUNT_SYNC, status }));
    m.accountRead.mockImplementation(async () => ({
      lastAccountSyncAt: new Date(Date.now() + 10_000),
      lastSuccessfulApiCallAt: new Date(Date.now() + 10_000),
    }));
  });
  it("admits exactly one job, releases lease and verifies account write", async () => {
    await expect(runOneAccountSync(sha)).resolves.toEqual({
      job: "SUCCEEDED", growth: "OFF", lease: "NONE", activeQueue: 0,
      providerGets: 1, providerWrites: 0, aiCalls: 0, telegram: 0,
    });
    expect(m.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ type: GrowthJobType.PINTEREST_ACCOUNT_SYNC,
        maxAttempts: 1, idempotencyKey: "growth-one-account-sync:" + sha }),
    }));
    expect(m.run).toHaveBeenCalledWith(expect.objectContaining({
      onlyJobId: "job123", batchSize: 1,
    }));
    expect(m.revoke).toHaveBeenCalledTimes(1);
    expect(process.env.GROWTH_PINTEREST_ONE_SYNC_JOB_ID).toBeUndefined();
  });
  it("blocks unexpected queue state without activating the worker", async () => {
    active = 1;
    await expect(runOneAccountSync(sha)).rejects.toThrow("ADMISSION_NOT_IDLE");
    expect(m.update).not.toHaveBeenCalled();
    expect(m.run).not.toHaveBeenCalled();
  });
  it("revokes the lease when the worker fails", async () => {
    m.run.mockRejectedValue(Error("worker failed"));
    await expect(runOneAccountSync(sha)).rejects.toThrow("worker failed");
    expect(m.revoke).toHaveBeenCalledOnce();
    expect(enabled).toBe(false);
  });
});
