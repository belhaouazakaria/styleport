// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  tests: vi.fn(),
  advance: vi.fn(),
  pin: vi.fn(),
  reserve: vi.fn(),
  fetch: vi.fn(),
  metrics: vi.fn(),
  update: vi.fn(),
}));
vi.mock("@/lib/prisma", () => {
  const db = {
    growthViralPinTest: {
      findMany: m.tests,
      updateMany: m.advance,
      update: m.update,
    },
    growthPinterestPin: { findUnique: m.pin, update: m.update },
    growthActivity: { findFirst: m.reserve, create: vi.fn() },
    $executeRaw: vi.fn(),
  };
  return {
    prisma: {
      ...db,
      $transaction: async (fn: (tx: unknown) => unknown) => fn(db),
    },
  };
});
vi.mock("@/lib/growth/pinterest/api", () => ({
  getPinterestPinAnalytics: m.fetch,
}));
vi.mock("@/lib/growth/pinterest/analytics", () => ({
  upsertPinterestPinMetricRows: m.metrics,
}));
import { collectSourceExperimentAnalytics } from "@/lib/growth/viral/source-analytics";
const now = new Date("2026-11-15T13:00:00Z");
const test = (id: string) => ({
  id,
  pinterestPinId: id,
  accountId: "owned",
  destinationUrl: "https://translator.whattypeof.com/source",
  updatedAt: new Date("2026-11-13"),
  publishedAt: new Date("2026-11-13"),
});
const pin = {
  id: "inventory",
  accountId: "owned",
  isActive: true,
  account: { connectionStatus: "CONNECTED", apiEnvironment: "PRODUCTION" },
  destinationUrl: test("x").destinationUrl,
};
beforeEach(() => {
  vi.clearAllMocks();
  m.tests.mockResolvedValue([test("old"), test("healthy")]);
  m.advance.mockResolvedValue({ count: 1 });
  m.pin.mockResolvedValue(pin);
  m.reserve.mockResolvedValue(null);
  m.fetch.mockResolvedValue({ data: {} });
});
it("skips a missing old Pin and fetches a healthy later experiment", async () => {
  m.pin.mockResolvedValueOnce(null);
  expect(await collectSourceExperimentAnalytics(now)).toMatchObject({
    fetched: 1,
    complete: false,
  });
  expect(m.fetch).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ pinterestPinId: "healthy", accountId: "owned" }),
  );
  expect(m.advance).toHaveBeenCalledTimes(2);
});
it("advances already-reserved experiments without starving another eligible read", async () => {
  m.reserve.mockResolvedValueOnce({ id: "already-read" });
  await collectSourceExperimentAnalytics(now);
  expect(m.fetch).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ pinterestPinId: "healthy" }),
  );
});
it("never reads a changed destination, foreign account or disconnected Pin", async () => {
  m.tests.mockResolvedValue([test("one"), test("two"), test("three")]);
  m.pin
    .mockResolvedValueOnce({
      ...pin,
      destinationUrl: "https://different.example",
    })
    .mockResolvedValueOnce({ ...pin, accountId: "foreign" })
    .mockResolvedValueOnce({
      ...pin,
      account: { ...pin.account, connectionStatus: "REAUTH_REQUIRED" },
    });
  expect(await collectSourceExperimentAnalytics(now)).toEqual({ fetched: 0 });
  expect(m.fetch).not.toHaveBeenCalled();
});
it("advances the attempt cursor before a provider failure; never fabricates metrics", async () => {
  m.fetch.mockRejectedValueOnce(Error("provider unavailable"));
  await expect(collectSourceExperimentAnalytics(now)).rejects.toThrow(
    "provider unavailable",
  );
  expect(m.advance).toHaveBeenCalled();
  expect(m.metrics).not.toHaveBeenCalled();
});
