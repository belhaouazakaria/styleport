import { beforeEach, describe, expect, it, vi } from "vitest";
import { GrowthJobStatus, GrowthJobType } from "@prisma/client";

const m = vi.hoisted(() => ({
  tx: vi.fn(), lock: vi.fn(),
  settings: vi.fn(), updateSettings: vi.fn(), accounts: vi.fn(),
  analyticsState: vi.fn(), blockers: vi.fn(),
  jobFind: vi.fn(), jobCreate: vi.fn(), accountFind: vi.fn(),
  activityCount: vi.fn(), audit: vi.fn(), reserveOne: vi.fn(),
  worker: vi.fn(), revoke: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: m.tx, $disconnect: vi.fn(),
    growthSettings: { findUnique: m.settings, updateMany: m.updateSettings },
    growthJob: { findUnique: m.jobFind, create: m.jobCreate },
    growthPinterestAccount: { findMany: m.accounts, findUnique: m.accountFind },
    growthPinterestAnalyticsState: { findUnique: m.analyticsState },
    growthActivity: { count: m.activityCount },
  },
}));
vi.mock("@/lib/growth/activity", () => ({ recordGrowthActivity: m.audit }));
vi.mock("@/lib/growth/operations/approved-publication-queue", () => ({
  countBlockingGrowthJobs: m.blockers,
}));
vi.mock("@/lib/growth/pinterest/one-sync-guard", () => ({
  reserveOneAccountSyncRequest: m.reserveOne,
}));
vi.mock("@/lib/growth/settings", () => ({
  revokeGrowthWorkerActivation: m.revoke,
}));
vi.mock("@/lib/growth/worker", () => ({ runGrowthWorker: m.worker }));

import { runDailyAccountAnalytics } from "@/workers/growth-daily-account-analytics";
import { runOneAccountSync } from "@/workers/growth-one-account-sync";

const sha = "a".repeat(40);
function account(id: string, role: string, last: string) {
  return {
    id, activeRole: role, encryptedCredentials: "opaque",
    grantedScopes: ["user_accounts:read", "pins:read"],
    accessTokenExpiresAt: new Date("2027-05-01T00:00:00Z"),
    refreshTokenExpiresAt: new Date("2027-06-01T00:00:00Z"),
    lastAccountSyncAt: new Date(last),
    analyticsState: { lastAccountAnalyticsSyncAt: new Date(last) },
  };
}

describe("bounded multi-account worker admission", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    m.accounts.mockResolvedValue([
      account("main", "SAYTWIST", "2026-11-11T12:00:00Z"),
      account("ideas", "SAYTWIST_IDEAS", "2026-11-12T12:00:00Z"),
    ]);
    m.settings.mockResolvedValue({
      enabled: false, attributionEnabled: false, workerActivationExpiresAt: null,
    });
    m.updateSettings.mockResolvedValue({ count: 1 });
    m.blockers.mockResolvedValue(0);
    m.analyticsState.mockResolvedValue({ accountId: "main" });
    m.jobCreate.mockResolvedValue({ id: "job123" });
    m.accountFind.mockImplementation(async () => ({
      lastAccountSyncAt: new Date(Date.now() + 3_000),
      lastSuccessfulApiCallAt: new Date(Date.now() + 3_000),
    }));
    m.activityCount.mockResolvedValue(0);
    m.audit.mockResolvedValue({});
    m.reserveOne.mockResolvedValue(undefined);
    m.worker.mockResolvedValue({
      status: "COMPLETED", claimed: 1, succeeded: 1, failed: 0,
    });
    m.revoke.mockResolvedValue(undefined);
    m.tx.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb({
      $queryRaw: m.lock,
      growthSettings: { findUnique: m.settings, updateMany: m.updateSettings },
      growthPinterestAccount: { findMany: m.accounts, findUnique: m.accountFind },
      growthPinterestAnalyticsState: { findUnique: m.analyticsState },
      growthJob: { findUnique: m.jobFind, create: m.jobCreate },
      growthActivity: { count: m.activityCount },
    }));
  });

  it("daily analytics selects one existing initialized account despite second new connection", async () => {
    m.accounts.mockResolvedValue([
      account("main", "SAYTWIST", "2026-11-11T12:00:00Z"),
      { ...account("ideas", "SAYTWIST_IDEAS", "2026-11-12T12:00:00Z"),
        analyticsState: null },
    ]);
    m.jobFind.mockResolvedValueOnce(null).mockResolvedValueOnce({
      type: GrowthJobType.PINTEREST_ACCOUNT_ANALYTICS_SYNC,
      status: GrowthJobStatus.SUCCEEDED,
    });
    await expect(runDailyAccountAnalytics("2026-11-13")).resolves.toMatchObject({
      job: "SUCCEEDED", pinsPublished: 0, aiCalls: 0,
    });
    expect(m.jobCreate).toHaveBeenCalledOnce();
    expect(m.jobCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        type: GrowthJobType.PINTEREST_ACCOUNT_ANALYTICS_SYNC,
        payload: expect.objectContaining({ accountId: "main" }),
      }),
    }));
    expect(m.worker).toHaveBeenCalledWith(expect.objectContaining({
      onlyJobId: "job123", batchSize: 1,
    }));
    expect(m.revoke).toHaveBeenCalledOnce();
  });

  it("daily analytics rotates to the other initialized account if its metrics are older", async () => {
    m.accounts.mockResolvedValue([
      account("main", "SAYTWIST", "2026-11-12T12:00:00Z"),
      account("ideas", "SAYTWIST_IDEAS", "2026-11-10T12:00:00Z"),
    ]);
    m.analyticsState.mockResolvedValue({ accountId: "ideas" });
    m.jobFind.mockResolvedValueOnce(null).mockResolvedValueOnce({
      type: GrowthJobType.PINTEREST_ACCOUNT_ANALYTICS_SYNC,
      status: GrowthJobStatus.SUCCEEDED,
    });
    await expect(runDailyAccountAnalytics("2026-11-13")).resolves.toMatchObject({
      job: "SUCCEEDED",
    });
    expect(m.jobCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        payload: expect.objectContaining({ accountId: "ideas" }),
      }),
    }));
    expect(m.jobCreate).toHaveBeenCalledTimes(1);
  });

  it("daily OBSERVE runs one scoped GET for least recently synced ready role", async () => {
    m.jobFind.mockResolvedValue({
      type: GrowthJobType.PINTEREST_ACCOUNT_SYNC,
      status: GrowthJobStatus.SUCCEEDED,
    });
    const day = new Date().toISOString().slice(0, 10);
    await expect(runOneAccountSync(sha, { dailyUtcDate: day })).resolves.toEqual(
      expect.objectContaining({
        job: "SUCCEEDED", providerGets: 1, providerWrites: 0,
        activeQueue: 0,
      }),
    );
    expect(m.reserveOne).toHaveBeenCalledOnce();
    expect(m.reserveOne).toHaveBeenCalledWith(
      expect.anything(), "main", "growth-daily-observe:" + day,
      expect.any(Date),
    );
    expect(m.jobCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        type: GrowthJobType.PINTEREST_ACCOUNT_SYNC,
        payload: { accountId: "main" }, maxAttempts: 1,
      }),
    }));
    expect(m.jobCreate).toHaveBeenCalledOnce();
    expect(m.worker).toHaveBeenCalledWith(expect.objectContaining({
      onlyJobId: "job123", batchSize: 1,
    }));
    expect(process.env.GROWTH_PINTEREST_ONE_SYNC_JOB_ID).toBeUndefined();
  });

  it("daily OBSERVE skips an account with a 24h reservation and uses another ready role", async () => {
    m.activityCount.mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    m.jobFind.mockResolvedValue({
      type: GrowthJobType.PINTEREST_ACCOUNT_SYNC,
      status: GrowthJobStatus.SUCCEEDED,
    });
    await runOneAccountSync(sha);
    expect(m.reserveOne).toHaveBeenCalledWith(
      expect.anything(), "ideas", "growth-one-account-sync:" + sha,
      expect.any(Date),
    );
    expect(m.jobCreate).toHaveBeenCalledOnce();
  });

  it("fails closed if every role is unready without allocating an account analytics job", async () => {
    m.accounts.mockResolvedValue([
      { ...account("ideas", "SAYTWIST_IDEAS", "2026-11-11T12:00:00Z"),
        analyticsState: null },
    ]);
    await expect(runDailyAccountAnalytics("2026-11-13")).rejects.toThrow(
      "DAILY_ANALYTICS_ACCOUNT_NOT_READY");
    expect(m.jobCreate).not.toHaveBeenCalled();
    expect(m.worker).not.toHaveBeenCalled();
  });
});
