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


describe("production network admission", () => {
  it("blocks unsafe endpoints before network or database access", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const transport = vi.fn();
    await expect(budgetedPinterestFetch("https://example.com/v5/user_account", {}, transport))
      .rejects.toMatchObject({ code: "UNSAFE_ENDPOINT" });
    expect(transport).not.toHaveBeenCalled();
    expect(mock.transaction).not.toHaveBeenCalled();
  });
  it("charges a request and persists a cooldown on provider 429", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const transport = vi.fn().mockResolvedValue(new Response("{}", { status: 429 }));
    await expect(budgetedPinterestFetch("https://api.pinterest.com/v5/user_account", {}, transport))
      .resolves.toHaveProperty("status", 429);
    expect(transport).toHaveBeenCalledOnce();
    expect(mock.record).toHaveBeenCalledTimes(2);
    expect(mock.record).toHaveBeenCalledWith(expect.objectContaining({
      action: "PINTEREST_GLOBAL_API_COOLDOWN",
    }));
  });
  it("blocks missing quota headers after consuming the attempt", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const transport = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    await expect(budgetedPinterestFetch("https://api.pinterest.com/v5/user_account", {}, transport))
      .rejects.toMatchObject({ code: "PROVIDER_QUOTA_UNKNOWN" });
    expect(transport).toHaveBeenCalledOnce();
    expect(mock.record).toHaveBeenCalledTimes(2);
  });
  it("accepts documented remaining headroom and never trusts unparseable limit numbers", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const transport = vi.fn().mockResolvedValue(new Response("{}", {
      status: 200, headers: {
        "x-ratelimit-limit": "nonstandard",
        "x-ratelimit-remaining": "99", "x-ratelimit-reset": "1",
      },
    }));
    await expect(budgetedPinterestFetch("https://api.pinterest.com/v5/user_account", {}, transport))
      .resolves.toHaveProperty("status", 200);
    expect(mock.record).toHaveBeenCalledOnce();
  });
});

describe("persistent admission limits", () => {
  it("prevents the fifth hourly attempt", async () => {
    mock.count.mockImplementation(({ where }: { where: { action: string } }) =>
      Promise.resolve(where.action === "PINTEREST_GLOBAL_API_REQUEST_RESERVED" ? 4 : 0));
    await expect(reservePinterestGlobalAttempt()).rejects.toMatchObject({
      code: "GLOBAL_QUOTA_EXHAUSTED",
    });
    expect(mock.record).not.toHaveBeenCalled();
  });
  it("honors an existing provider cooldown across process invocations", async () => {
    mock.count.mockImplementation(({ where }: { where: { action: string } }) =>
      Promise.resolve(where.action === "PINTEREST_GLOBAL_API_COOLDOWN" ? 1 : 0));
    await expect(reservePinterestGlobalAttempt()).rejects.toMatchObject({
      code: "PROVIDER_COOLDOWN",
    });
    expect(mock.record).not.toHaveBeenCalled();
  });
});
