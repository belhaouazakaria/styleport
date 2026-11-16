// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ query: vi.fn(), pin: vi.fn(), account: vi.fn(), state: vi.fn(), activity: vi.fn() }));
vi.mock("@/lib/prisma", () => {
  const db = { $queryRaw: m.query, growthPinterestPin: { updateMany: m.pin }, growthPinterestAccount: { findUniqueOrThrow: m.account }, growthPinterestAnalyticsState: { updateMany: m.state } };
  return { prisma: { ...db, $transaction: async (fn: (tx: unknown) => unknown) => fn(db) } };
});
vi.mock("@/lib/growth/activity", () => ({ recordGrowthActivity: m.activity }));
import { recordUnavailablePinterestAnalytics, unavailablePinterestAnalyticsPins } from "@/lib/growth/pinterest/analytics-access";
beforeEach(() => { vi.clearAllMocks(); m.account.mockResolvedValue({ credentialVersion: 2 }); m.pin.mockResolvedValue({ count: 1 }); m.query.mockResolvedValue([{ id: "blocked-pin" }]); });
it("records provider denial and removes only that Pin from analytics without inventing metrics", async () => {
  await recordUnavailablePinterestAnalytics("account", "blocked-pin");
  expect(m.pin).toHaveBeenCalledWith({ where: { id: "blocked-pin", accountId: "account" }, data: { analyticsEligible: false } });
  expect(m.activity).toHaveBeenCalledWith(expect.objectContaining({ entityId: "blocked-pin", summary: expect.objectContaining({ providerStatus: 403, providerCode: "29", credentialVersion: 2 }) }), expect.anything());
  expect(await unavailablePinterestAnalyticsPins("account")).toEqual(new Set(["blocked-pin"]));
  const query = m.query.mock.calls[0][0].join(" ");
  expect(query).toContain('account."credentialVersion"::text');
});
it("refuses to attach resource-access evidence to a Pin in another account", async () => {
  m.pin.mockResolvedValue({ count: 0 });
  await expect(recordUnavailablePinterestAnalytics("other-account", "blocked-pin")).rejects.toThrow("PIN_ANALYTICS_ACCOUNT_MISMATCH");
  expect(m.activity).not.toHaveBeenCalled();
});
