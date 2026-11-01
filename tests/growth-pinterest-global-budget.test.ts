import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  lock: vi.fn(), count: vi.fn(), record: vi.fn(), transaction: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: { $transaction: mock.transaction } }));
vi.mock("@/lib/growth/activity", () => ({ recordGrowthActivity: mock.record }));
import { budgetedPinterestFetch, reservePinterestGlobalAttempt, PINTEREST_GLOBAL_HOURLY_CEILING } from "@/lib/growth/pinterest/global-budget";

beforeEach(() => {
  vi.clearAllMocks();
  mock.lock.mockResolvedValue([{ id: "global" }]);
  mock.count.mockResolvedValue(0);
  mock.record.mockResolvedValue({});
  mock.transaction.mockImplementation(async callback => callback({
    $queryRaw: mock.lock, growthActivity: { count: mock.count },
  }));
});
afterEach(() => vi.unstubAllEnvs());

describe("persistent Pinterest quota", () => {
  it("serializes via the GrowthSettings row and records a pre-call reservation", async () => {
    expect(PINTEREST_GLOBAL_HOURLY_CEILING).toBe(4);
    await reservePinterestGlobalAttempt();
    expect(mock.lock).toHaveBeenCalledOnce();
    expect(mock.count).toHaveBeenCalledTimes(3);
    expect(mock.record).toHaveBeenCalledWith(expect.objectContaining({
      action: "PINTEREST_GLOBAL_API_REQUEST_RESERVED",
    }), expect.anything());
  });
  it("fails closed when the canonical row cannot be locked", async () => {
    mock.lock.mockResolvedValue([]);
    await expect(reservePinterestGlobalAttempt()).rejects.toMatchObject({
      code: "ADMISSION_CLOSED",
    });
    expect(mock.record).not.toHaveBeenCalled();
  });
});
