// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  count: vi.fn(),
  outbox: vi.fn(),
  expire: vi.fn(),
}));
vi.mock("node:fs", () => ({ readFileSync: () => "a".repeat(40) }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: async () => ({ role: "ADMIN" }) },
    growthNotification: { count: m.count },
  },
}));
vi.mock("@/lib/growth/discord/config", () => ({
  getDiscordConfig: () => ({ ownerUserId: "owner" }),
}));
vi.mock("@/lib/growth/approvals/service", () => ({
  expireGrowthReviews: m.expire,
  preparePendingOwnerReviews: vi.fn(),
}));
vi.mock("@/lib/growth/discord/outbox", () => ({ runDiscordOutbox: m.outbox }));
import { runGrowthDiscordCourier } from "@/workers/growth-discord-courier";
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("EXPECTED_RELEASE", "a".repeat(40));
  vi.stubEnv("GROWTH_DISCORD_COURIER_ENABLED", "true");
  vi.stubEnv("GROWTH_DISCORD_COURIER_ENTRYPOINT", "false");
  vi.stubEnv("GROWTH_AUTOMATIC_REVIEW_PREPARATION_ENABLED", "false");
  m.count.mockResolvedValue(0);
  m.outbox.mockResolvedValue({ sent: 1, processed: 1 });
});
afterEach(() => vi.unstubAllEnvs());
it("processes decisions and deliveries before declaring the courier healthy", async () => {
  expect(await runGrowthDiscordCourier()).toEqual({ sent: 1, processed: 1 });
  expect(m.outbox).toHaveBeenCalledOnce();
  expect(m.count).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({
        status: { in: ["UNKNOWN", "DEAD"] },
        OR: [
          { lastErrorCode: null },
          { lastErrorCode: { not: "REVIEW_CLOSED_BEFORE_DELIVERY" } },
        ],
      }),
    }),
  );
});
it("surfaces unresolved delivery failures after independent actions have progressed", async () => {
  m.count.mockResolvedValue(1);
  await expect(runGrowthDiscordCourier()).rejects.toThrow(
    "DISCORD_DELIVERY_REQUIRES_RECONCILIATION",
  );
  expect(m.outbox).toHaveBeenCalledOnce();
  expect(m.expire).toHaveBeenCalledOnce();
});
