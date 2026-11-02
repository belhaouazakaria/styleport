import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  budgetedPinterestFetch,
  PINTEREST_GLOBAL_DAILY_CEILING,
  PINTEREST_GLOBAL_HOURLY_CEILING,
  reservePinterestGlobalAttempt,
} from "@/lib/growth/pinterest/global-budget";

const enabled = process.env.RUN_GROWTH_PINTEREST_BUDGET_DB_TESTS === "1";
const suite = enabled ? describe.sequential : describe.skip;
const databaseName = "saytwist_growth_phase14f_budget_test";
const reservedAction = "PINTEREST_GLOBAL_API_REQUEST_RESERVED";
const cooldownAction = "PINTEREST_GLOBAL_API_COOLDOWN";
const budgetEntity = "GrowthPinterestProviderBudget";

if (enabled) {
  const explicit = process.env.GROWTH_PINTEREST_BUDGET_TEST_DATABASE_URL;
  if (!explicit || process.env.DATABASE_URL !== explicit) {
    throw Error("Pinterest budget integration requires an exact explicitly selected disposable database.");
  }
  const url = new URL(explicit);
  if (!["127.0.0.1", "localhost", "::1"].includes(url.hostname) ||
      decodeURIComponent(url.pathname.slice(1)) !== databaseName) {
    throw Error("Pinterest budget integration refuses a non-disposable database.");
  }
}

async function clean() {
  if (!enabled) return;
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "GrowthActivity"');
  await prisma.growthSettings.upsert({
    where: { id: "global" },
    create: { id: "global", enabled: false, attributionEnabled: false },
    update: { enabled: false, attributionEnabled: false, workerActivationExpiresAt: null },
  });
}

beforeEach(clean);
afterEach(() => vi.unstubAllEnvs());
afterAll(async () => { if (enabled) { await clean(); await prisma.$disconnect(); } });

suite("Phase14F disposable PostgreSQL 18 shared Pinterest admission", () => {
  it("admits only four of twelve simultaneous transactions across the shared database row lock", async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 12 }, () => reservePinterestGlobalAttempt()),
    );
    expect(results.filter(x => x.status === "fulfilled")).toHaveLength(PINTEREST_GLOBAL_HOURLY_CEILING);
    expect(results.filter(x => x.status === "rejected")).toHaveLength(8);
    expect(await prisma.growthActivity.count({
      where: { entityType: budgetEntity, action: reservedAction },
    })).toBe(PINTEREST_GLOBAL_HOURLY_CEILING);
  }, 40_000);

  it("persists attempts and rejects further reservations on a second invocation", async () => {
    await Promise.all(Array.from({ length: PINTEREST_GLOBAL_HOURLY_CEILING },
      () => reservePinterestGlobalAttempt()));
    await expect(reservePinterestGlobalAttempt()).rejects.toMatchObject({
      code: "GLOBAL_QUOTA_EXHAUSTED",
    });
    expect(await prisma.growthActivity.count({ where: { action: reservedAction } }))
      .toBe(PINTEREST_GLOBAL_HOURLY_CEILING);
  }, 40_000);

  it("enforces the rolling daily cap even when requests predate the hourly window", async () => {
    const old = new Date(Date.now() - 2 * 60 * 60_000);
    await prisma.growthActivity.createMany({
      data: Array.from({ length: PINTEREST_GLOBAL_DAILY_CEILING }, () => ({
        actorKind: "SYSTEM" as const, entityType: budgetEntity,
        entityId: "production-global", action: reservedAction, createdAt: old,
      })),
    });
    await expect(reservePinterestGlobalAttempt()).rejects.toMatchObject({
      code: "GLOBAL_QUOTA_EXHAUSTED",
    });
  });

  it("records and enforces provider cooldown after one mocked rate-limited request", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const mockTransport = vi.fn().mockResolvedValue(new Response("{}", { status: 429 }));
    await budgetedPinterestFetch("https://api.pinterest.com/v5/user_account",
      { method: "GET" }, mockTransport);
    await expect(budgetedPinterestFetch("https://api.pinterest.com/v5/user_account",
      { method: "GET" }, mockTransport)).rejects.toMatchObject({
      code: "PROVIDER_COOLDOWN",
    });
    expect(mockTransport).toHaveBeenCalledTimes(1);
    expect(await prisma.growthActivity.count({ where: { action: cooldownAction } })).toBe(1);
    expect(await prisma.growthActivity.count({ where: { action: reservedAction } })).toBe(1);
  });

  it("does not send when a database reservation cannot commit", async () => {
    await prisma.growthSettings.delete({ where: { id: "global" } });
    vi.stubEnv("NODE_ENV", "production");
    const mockTransport = vi.fn();
    await expect(budgetedPinterestFetch("https://api.pinterest.com/v5/user_account",
      {}, mockTransport)).rejects.toMatchObject({ code: "ADMISSION_CLOSED" });
    expect(mockTransport).not.toHaveBeenCalled();
  });
});
