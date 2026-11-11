import { beforeEach, describe, expect, it, vi } from "vitest";
import { GrowthJobStatus, GrowthJobType } from "@prisma/client";

const m = vi.hoisted(() => ({
  settings: vi.fn(), blocking: vi.fn(), accounts: vi.fn(), recentJob: vi.fn(),
}));
vi.mock("@/lib/growth/operations/approved-publication-queue", () => ({
  countBlockingGrowthJobs: m.blocking,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    growthSettings: { findUnique: m.settings },
    growthPinterestAccount: { findMany: m.accounts },
    growthJob: { findFirst: m.recentJob },
  },
}));
import { hasVerifiedRecentPinterestAccountSync } from "@/lib/growth/pinterest/daily-observe-freshness";

const now = new Date("2026-11-11T13:00:01.000Z");
const sync = new Date("2026-11-11T12:56:09.869Z");
const success = new Date("2026-11-11T12:56:09.892Z");
const accountId = "cmuvr3r5m0010a56v2mwzp035";

const account = () => ({
  id: accountId, encryptedCredentials: "opaque",
  grantedScopes: ["user_accounts:read", "boards:read"],
  accessTokenExpiresAt: new Date("2026-12-11T12:55:06Z"),
  refreshTokenExpiresAt: new Date("2027-01-11T12:55:06Z"),
  lastAccountSyncAt: sync, lastSuccessfulApiCallAt: sync,
});

describe("daily OBSERVE respects verified 24-hour account freshness", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    m.settings.mockResolvedValue({
      enabled: false, attributionEnabled: false, workerActivationExpiresAt: null,
    });
    m.blocking.mockResolvedValue(0);
    m.accounts.mockResolvedValue([account()]);
    m.recentJob.mockResolvedValue({ completedAt: success, attemptCount: 1 });
  });
  it("recognizes completed owner sync within 24h with zero additional GETs", async () => {
    expect(await hasVerifiedRecentPinterestAccountSync(now)).toBe(true);
    expect(m.recentJob).toHaveBeenCalledWith({
      where: {
        type: GrowthJobType.PINTEREST_ACCOUNT_SYNC,
        status: GrowthJobStatus.SUCCEEDED,
        completedAt: { gte: new Date("2026-11-10T13:00:01.000Z"), lte: now },
        payload: { path: ["accountId"], equals: accountId },
      },
      select: { completedAt: true, attemptCount: true },
      orderBy: [{ completedAt: "desc" }, { id: "asc" }],
    });
  });
  it("does not mistake a reserved-but-failed GET for success", async () => {
    m.recentJob.mockResolvedValue(null);
    expect(await hasVerifiedRecentPinterestAccountSync(now)).toBe(false);
    m.recentJob.mockResolvedValue({ completedAt: success, attemptCount: 0 });
    expect(await hasVerifiedRecentPinterestAccountSync(now)).toBe(false);
  });
  it("rejects stale, mismatched or soon-expiring evidence", async () => {
    m.accounts.mockResolvedValue([{ ...account(), lastAccountSyncAt: new Date("2026-11-10T12:55:00Z") }]);
    expect(await hasVerifiedRecentPinterestAccountSync(now)).toBe(false);
    m.accounts.mockResolvedValue([{ ...account(), lastSuccessfulApiCallAt: new Date("2026-11-11T12:30:00Z") }]);
    expect(await hasVerifiedRecentPinterestAccountSync(now)).toBe(false);
    m.accounts.mockResolvedValue([{ ...account(), accessTokenExpiresAt: new Date("2026-11-11T13:10:00Z") }]);
    expect(await hasVerifiedRecentPinterestAccountSync(now)).toBe(false);
  });
  it("rejects blocking jobs, global leases, and multiple connected accounts", async () => {
    m.blocking.mockResolvedValue(1);
    expect(await hasVerifiedRecentPinterestAccountSync(now)).toBe(false);
    m.blocking.mockResolvedValue(0);
    m.settings.mockResolvedValue({ enabled: true, attributionEnabled: false, workerActivationExpiresAt: new Date("2026-11-11T13:04:00Z") });
    expect(await hasVerifiedRecentPinterestAccountSync(now)).toBe(false);
    m.settings.mockResolvedValue({ enabled: false, attributionEnabled: false, workerActivationExpiresAt: null });
    m.accounts.mockResolvedValue([account(), account()]);
    expect(await hasVerifiedRecentPinterestAccountSync(now)).toBe(false);
  });
});
