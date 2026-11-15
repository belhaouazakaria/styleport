// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  page: vi.fn(),
  update: vi.fn(),
  activity: vi.fn(),
  accounts: vi.fn(),
  refresh: vi.fn(),
  capacity: vi.fn(),
}));
vi.mock("@/lib/prisma", () => {
  const db = {
    growthPinterestAccount: {
      findMany: m.accounts,
      findUniqueOrThrow: m.refresh,
      updateMany: m.update,
    },
    growthActivity: {},
    $transaction: async (fn: (tx: unknown) => unknown) => fn(db),
  };
  return { prisma: db };
});
vi.mock("@/lib/growth/activity", () => ({ recordGrowthActivity: m.activity }));
vi.mock("@/lib/growth/pinterest/api", () => ({
  getPinterestBoardsPage: m.page,
  getPinterestUserAccount: vi.fn(),
}));
vi.mock("@/lib/growth/pinterest/global-budget", async (importOriginal) => {
  const original =
    await importOriginal<
      typeof import("@/lib/growth/pinterest/global-budget")
    >();
  return { ...original, hasPinterestMaintenanceCapacity: m.capacity };
});
import * as syncModule from "@/lib/growth/pinterest/sync";
import { syncPinterestBoards } from "@/lib/growth/pinterest/sync";
import { auditPinterestReadiness } from "@/lib/growth/pinterest/account-readiness";
import { PinterestGlobalBudgetBlocked } from "@/lib/growth/pinterest/global-budget";
import {
  RetryableGrowthJobError,
  NonRetryableGrowthJobError,
} from "@/lib/growth/errors";
beforeEach(() => {
  vi.clearAllMocks();
  m.capacity.mockResolvedValue(true);
});
it.each([
  new PinterestGlobalBudgetBlocked("GLOBAL_QUOTA_EXHAUSTED"),
  new RetryableGrowthJobError("transient provider outage", 60000),
])(
  "does not disconnect a healthy account for a deferred read",
  async (error) => {
    m.page.mockRejectedValueOnce(error);
    await expect(syncPinterestBoards("owned")).rejects.toBe(error);
    expect(m.update).not.toHaveBeenCalled();
    expect(m.activity).toHaveBeenCalledWith(
      expect.objectContaining({ action: "PINTEREST_BOARD_SYNC_DEFERRED" }),
      expect.anything(),
    );
  },
);
it("still marks a nonrecoverable read failure for attention", async () => {
  m.page.mockRejectedValueOnce(
    new NonRetryableGrowthJobError("invalid response"),
  );
  await expect(syncPinterestBoards("owned")).rejects.toThrow();
  expect(m.update).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({ connectionStatus: "DEGRADED" }),
    }),
  );
});
it("defers a degraded account's recovery before a provider request when read quota is full", async () => {
  m.accounts.mockResolvedValue([
    {
      id: "owned",
      publicationRole: "SAYTWIST",
      connectionStatus: "DEGRADED",
      grantedScopes: ["boards:read"],
      refreshTokenExpiresAt: null,
      lastBoardSyncAt: new Date(),
      boards: [],
    },
  ]);
  m.capacity.mockResolvedValue(false);
  expect(await auditPinterestReadiness(new Date(), true)).toMatchObject({
    synchronized: false,
    quotaDeferred: true,
    accounts: [expect.objectContaining({ health: "READ_RECOVERY_NEEDED" })],
  });
  expect(m.page).not.toHaveBeenCalled();
});

afterEach(() => vi.restoreAllMocks());
it("recovers a transiently degraded account and reports its refreshed inventory", async () => {
  const now = new Date();
  const account = {
    id: "owned",
    publicationRole: "SAYTWIST",
    connectionStatus: "DEGRADED",
    grantedScopes: ["boards:read", "boards:write", "pins:read", "pins:write"],
    refreshTokenExpiresAt: null,
    lastBoardSyncAt: new Date(+now - 1000),
    boards: [],
  };
  m.accounts.mockResolvedValue([account]);
  m.refresh.mockResolvedValue({
    ...account,
    connectionStatus: "CONNECTED",
    lastBoardSyncAt: now,
    boards: [{ id: "public" }],
  });
  vi.spyOn(syncModule, "syncPinterestBoards").mockResolvedValue({
    accountId: "owned",
    boardCount: 1,
  });
  expect(await auditPinterestReadiness(now, true)).toMatchObject({
    synchronized: true,
    accounts: [
      expect.objectContaining({
        health: "READY",
        activeBoards: 1,
        lastBoardSyncAt: now.toISOString(),
      }),
    ],
  });
});
