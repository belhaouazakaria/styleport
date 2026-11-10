import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  boardsPage: vi.fn(),
  transaction: vi.fn(),
  boardUpsert: vi.fn(),
  boardUpdate: vi.fn(),
  accountUpdate: vi.fn(),
  audit: vi.fn(),
}));

vi.mock("@/lib/growth/pinterest/api", () => ({
  getPinterestBoardsPage: mocks.boardsPage,
  getPinterestUserAccount: vi.fn(),
}));
vi.mock("@/lib/growth/activity", () => ({ recordGrowthActivity: mocks.audit }));
vi.mock("@/lib/growth/safe-data", () => ({ toSafeGrowthError: () => "SAFE_SYNC_FAILURE" }));
vi.mock("@/lib/prisma", () => ({
  prisma: { $transaction: mocks.transaction },
}));

import { syncPinterestBoards } from "@/lib/growth/pinterest/sync";

describe("Bounded single-page board inventory commit", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.boardUpsert.mockResolvedValue({});
    mocks.boardUpdate.mockResolvedValue({});
    mocks.accountUpdate.mockResolvedValue({});
    mocks.audit.mockResolvedValue({});
    mocks.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn({
      growthPinterestBoard: {
        upsert: mocks.boardUpsert, updateMany: mocks.boardUpdate,
      },
      growthPinterestAccount: { update: mocks.accountUpdate,
        updateMany: mocks.accountUpdate },
    }));
  });

  it("persists one complete 18-board page, then deactivates only stale boards", async () => {
    const boards = Array.from({ length: 18 }, (_, i) => ({
      id: "board-" + i, name: "Board " + i,
    }));
    mocks.boardsPage.mockResolvedValue({ data: { items: boards } });
    await expect(syncPinterestBoards("account123", undefined, { maxPages: 1 }))
      .resolves.toMatchObject({ accountId: "account123", boardCount: 18 });
    expect(mocks.boardsPage).toHaveBeenCalledOnce();
    expect(mocks.boardUpsert).toHaveBeenCalledTimes(18);
    expect(mocks.boardUpdate).toHaveBeenCalledOnce();
    expect(mocks.accountUpdate).toHaveBeenCalledOnce();
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({
      action: "PINTEREST_BOARD_SYNC_COMPLETED",
      summary: expect.objectContaining({ boardCount: 18, pageCount: 1 }),
    }), expect.anything());
  });

  it("rejects pagination before modifying board inventory or account last-board-sync timestamp", async () => {
    mocks.boardsPage.mockResolvedValue({ data: {
      items: [{ id: "board1", name: "A" }],
      bookmark: "more-boards",
    } });
    await expect(syncPinterestBoards("account123", undefined, { maxPages: 1 }))
      .rejects.toThrow("PINTEREST_BOARD_SYNC_PAGE_LIMIT");
    expect(mocks.boardsPage).toHaveBeenCalledOnce();
    expect(mocks.boardUpsert).not.toHaveBeenCalled();
    expect(mocks.boardUpdate).not.toHaveBeenCalled();
  });

  it("does not delete every saved board when one-page provider inventory is empty", async () => {
    mocks.boardsPage.mockResolvedValue({ data: { items: [] } });
    await expect(syncPinterestBoards("account123", undefined, { maxPages: 1 }))
      .rejects.toThrow("PINTEREST_BOARD_SYNC_EMPTY_RESPONSE");
    expect(mocks.boardUpsert).not.toHaveBeenCalled();
    expect(mocks.boardUpdate).not.toHaveBeenCalled();
  });

  it("retains standard multi-page behavior outside the manually bounded scope", async () => {
    mocks.boardsPage
      .mockResolvedValueOnce({ data: { items: [
        { id: "board1", name: "A" },
      ], bookmark: "next" } })
      .mockResolvedValueOnce({ data: { items: [
        { id: "board2", name: "B" },
      ] } });
    await expect(syncPinterestBoards("account123")).resolves.toMatchObject({
      boardCount: 2,
    });
    expect(mocks.boardsPage).toHaveBeenCalledTimes(2);
    expect(mocks.boardUpsert).toHaveBeenCalledTimes(2);
  });
});
