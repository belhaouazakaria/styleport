import { randomBytes, randomUUID } from "node:crypto";
import {
  GrowthPinterestAnalyticsStatus,
  GrowthPinterestApiEnvironment,
  GrowthPinterestConnectionStatus,
  GrowthPinterestPublicationRole,
} from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  enqueuePinterestAnalyticsSync,
  syncPinterestAccountAnalytics,
  syncPinterestPinAnalytics,
  syncPinterestPinInventory,
} from "@/lib/growth/pinterest/analytics";
import { encryptPinterestCredentials } from "@/lib/growth/pinterest/credentials";
import { getPinterestAnalyticsDashboard } from "@/lib/growth/pinterest/reporting";
import { prisma } from "@/lib/prisma";

const enabled = process.env.RUN_GROWTH_ANALYTICS_DB_TESTS === "1";
const databaseDescribe = enabled ? describe.sequential : describe.skip;
const requiredDatabaseName = "saytwist_growth_phase4_test";
const encryptionKey = randomBytes(32).toString("base64");

if (enabled) {
  const explicitUrl = process.env.GROWTH_ANALYTICS_TEST_DATABASE_URL;
  if (!explicitUrl || process.env.DATABASE_URL !== explicitUrl) throw new Error("Phase 4 DB tests require matching explicit test database URLs.");
  const parsed = new URL(explicitUrl);
  if (!['localhost', '127.0.0.1', '::1'].includes(parsed.hostname) || decodeURIComponent(parsed.pathname.slice(1)) !== requiredDatabaseName) {
    throw new Error(`Phase 4 DB tests refuse every target except local database ${requiredDatabaseName}.`);
  }
}

async function clean() {
  await prisma.growthActivity.deleteMany();
  await prisma.growthJob.deleteMany();
  await prisma.growthPinterestPinMetricDaily.deleteMany();
  await prisma.growthPinterestAccountMetricDaily.deleteMany();
  await prisma.growthPinterestPin.deleteMany();
  await prisma.growthPinterestAnalyticsState.deleteMany();
  await prisma.growthPinterestBoard.deleteMany();
  await prisma.growthPinterestAccount.deleteMany();
}

async function createAccount() {
  return prisma.growthPinterestAccount.create({ data: {
    pinterestAccountId: `pin-${randomUUID()}`,
    publicationRole: GrowthPinterestPublicationRole.SAYTWIST,
    activeRole: GrowthPinterestPublicationRole.SAYTWIST,
    username: `user-${randomUUID()}`,
    apiEnvironment: GrowthPinterestApiEnvironment.PRODUCTION,
    connectionStatus: GrowthPinterestConnectionStatus.CONNECTED,
    grantedScopes: ["boards:read", "pins:read", "pins:write", "user_accounts:read"],
    encryptedCredentials: encryptPinterestCredentials({ accessToken: "access", refreshToken: "refresh" }, encryptionKey),
    accessTokenExpiresAt: new Date(Date.now() + 3_600_000),
  } });
}

function response(body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "x-ratelimit-remaining": "900", ...headers } });
}

beforeAll(() => {
  vi.stubEnv("PINTEREST_APP_ID", "phase4-app");
  vi.stubEnv("PINTEREST_APP_SECRET", "phase4-secret");
  vi.stubEnv("PINTEREST_REDIRECT_URI", "http://localhost:3000/api/admin/growth/pinterest/oauth/callback");
  vi.stubEnv("PINTEREST_API_ENVIRONMENT", "production");
  vi.stubEnv("GROWTH_CREDENTIAL_ENCRYPTION_KEY", encryptionKey);
});
beforeEach(clean);
afterAll(async () => { if (enabled) await clean(); vi.unstubAllEnvs(); await prisma.$disconnect(); });

databaseDescribe("Pinterest Phase 4 PostgreSQL persistence", () => {
  it("upserts globally unique Pins and deactivates unseen Pins only after a complete inventory", async () => {
    const account = await createAccount();
    await prisma.growthPinterestPin.create({ data: { accountId: account.id, pinterestPinId: "100", title: "Old", lastSeenAt: new Date(0), lastSyncedAt: new Date(0) } });
    await enqueuePinterestAnalyticsSync(account.id, new Date("2026-10-05T12:00:00Z"));
    const fetchMock = vi.fn().mockResolvedValue(response({ items: [{ id: "200", title: "New", link: "https://saytwist.com/test", created_at: "2026-10-01T00:00:00Z" }], bookmark: null }));
    await syncPinterestPinInventory({ accountId: account.id, startDate: "2026-07-08", endDate: "2026-10-05", runStartedAt: "2026-10-05T12:00:00.000Z", fetchImpl: fetchMock });
    expect((await prisma.growthPinterestPin.findUniqueOrThrow({ where: { pinterestPinId: "100" } })).isActive).toBe(false);
    expect((await prisma.growthPinterestPin.findUniqueOrThrow({ where: { pinterestPinId: "200" } })).title).toBe("New");
    await expect(prisma.growthPinterestPin.create({ data: { accountId: account.id, pinterestPinId: "200", lastSeenAt: new Date(), lastSyncedAt: new Date() } })).rejects.toMatchObject({ code: "P2002" });
  });

  it("resumes after a later-page failure and accepts polymorphic media without duplicate or premature deactivation", async () => {
    const account = await createAccount();
    const existing = await prisma.growthPinterestPin.create({ data: { accountId: account.id, pinterestPinId: "300", lastSeenAt: new Date(0), lastSyncedAt: new Date(0) } });
    await enqueuePinterestAnalyticsSync(account.id, new Date("2026-10-05T12:00:00Z"));
    const firstPagePins = Array.from({ length: 50 }, (_, index) => ({ id: String(1_000 + index), media: { media_type: "image" } }));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ items: firstPagePins, bookmark: "next" }))
      .mockResolvedValueOnce(new Response("{}", { status: 500 }));
    await expect(syncPinterestPinInventory({ accountId: account.id, startDate: "2026-07-08", endDate: "2026-10-05", runStartedAt: "2026-10-05T12:00:00.000Z", fetchImpl: fetchMock })).rejects.toThrow("HTTP 500");
    expect((await prisma.growthPinterestPin.findUniqueOrThrow({ where: { id: existing.id } })).isActive).toBe(true);
    expect(await prisma.growthPinterestAnalyticsState.findUniqueOrThrow({ where: { accountId: account.id } })).toMatchObject({ inventoryBookmark: "next", inventoryPageCount: 1, inventoryPinCount: 50, status: GrowthPinterestAnalyticsStatus.PARTIAL });

    await enqueuePinterestAnalyticsSync(account.id, new Date("2026-10-05T12:05:00Z"));
    const resumeFetch = vi.fn().mockResolvedValue(response({
      items: [
        { id: "1000", media: { media_type: "image" } },
        { id: "302", media: { media_type: "multiple_images", items: [{ item_type: "image", images: { "600x": { width: 600, height: 900, url: "https://i.pinimg.com/resumed.jpg" } } }] } },
      ],
      bookmark: null,
    }));
    await expect(syncPinterestPinInventory({ accountId: account.id, startDate: "2026-07-08", endDate: "2026-10-05", runStartedAt: "2026-10-05T12:05:00.000Z", fetchImpl: resumeFetch })).resolves.toMatchObject({ complete: true });
    expect(String(resumeFetch.mock.calls[0][0])).toContain("bookmark=next");
    expect(await prisma.growthPinterestPin.count({ where: { accountId: account.id, pinterestPinId: "1000" } })).toBe(1);
    expect((await prisma.growthPinterestPin.findUniqueOrThrow({ where: { pinterestPinId: "1000" } })).isActive).toBe(true);
    expect((await prisma.growthPinterestPin.findUniqueOrThrow({ where: { pinterestPinId: "302" } })).previewImageUrl).toBe("https://i.pinimg.com/resumed.jpg");
    expect((await prisma.growthPinterestPin.findUniqueOrThrow({ where: { id: existing.id } })).isActive).toBe(false);
    expect(await prisma.growthPinterestAnalyticsState.findUniqueOrThrow({ where: { accountId: account.id } })).toMatchObject({ inventoryBookmark: null, inventoryPageCount: 0 });
  });

  it("continues from a 50-Pin page through a polymorphic-media page that the former parser rejected", async () => {
    const account = await createAccount();
    await enqueuePinterestAnalyticsSync(account.id, new Date("2026-10-05T13:00:00Z"));
    const firstPagePins = Array.from({ length: 50 }, (_, index) => ({ id: String(2_000 + index), media: { media_type: "image" } }));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ items: firstPagePins, bookmark: "page-two" }))
      .mockResolvedValueOnce(response({ items: [{
        id: "2050",
        media: {
          media_type: "video",
          images: { "600x": { width: 600, height: 900, url: "pinterest-image-reference" } },
          cover_image_url: "https://i.pinimg.com/video-cover.jpg",
        },
      }], bookmark: null }));

    await expect(syncPinterestPinInventory({ accountId: account.id, startDate: "2026-07-08", endDate: "2026-10-05", runStartedAt: "2026-10-05T13:00:00.000Z", fetchImpl: fetchMock })).resolves.toMatchObject({ complete: true, pins: 51 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(await prisma.growthPinterestPin.count({ where: { accountId: account.id } })).toBe(51);
    expect((await prisma.growthPinterestPin.findUniqueOrThrow({ where: { pinterestPinId: "2050" } })).previewImageUrl).toBe("https://i.pinimg.com/video-cover.jpg");
  });

  it("detects repeated inventory bookmarks without deactivating Pins", async () => {
    const account = await createAccount();
    await prisma.growthPinterestPin.create({ data: { accountId: account.id, pinterestPinId: "400", lastSeenAt: new Date(0), lastSyncedAt: new Date(0) } });
    await enqueuePinterestAnalyticsSync(account.id, new Date("2026-10-05T12:00:00Z"));
    const fetchMock = vi.fn().mockResolvedValueOnce(response({ items: [], bookmark: "loop" })).mockResolvedValueOnce(response({ items: [], bookmark: "loop" }));
    await expect(syncPinterestPinInventory({ accountId: account.id, startDate: "2026-07-08", endDate: "2026-10-05", runStartedAt: "2026-10-05T12:00:00.000Z", fetchImpl: fetchMock })).rejects.toThrow("repeated a bookmark");
    expect((await prisma.growthPinterestPin.findUniqueOrThrow({ where: { pinterestPinId: "400" } })).isActive).toBe(true);
  });

  it("upserts daily account metrics and accepts later corrections without duplicates", async () => {
    const account = await createAccount();
    await enqueuePinterestAnalyticsSync(account.id, new Date("2026-10-05T12:00:00Z"));
    const body = (outbound: number) => ({ all: { daily_metrics: [{ date: "2026-10-05", data_status: "READY", metrics: { IMPRESSION: 100, SAVE: 2, PIN_CLICK: 5, OUTBOUND_CLICK: outbound, ENGAGEMENT: 7 } }] } });
    await syncPinterestAccountAnalytics({ accountId: account.id, startDate: "2026-10-05", endDate: "2026-10-05", fetchImpl: vi.fn().mockResolvedValueOnce(response(body(3))).mockResolvedValueOnce(response({ sort_by: "OUTBOUND_CLICK", pins: [] })) });
    await syncPinterestAccountAnalytics({ accountId: account.id, startDate: "2026-10-05", endDate: "2026-10-05", fetchImpl: vi.fn().mockResolvedValueOnce(response(body(4))).mockResolvedValueOnce(response({ sort_by: "OUTBOUND_CLICK", pins: [] })) });
    expect(await prisma.growthPinterestAccountMetricDaily.count()).toBe(1);
    expect((await prisma.growthPinterestAccountMetricDaily.findFirstOrThrow()).outboundClicks).toBe(BigInt(4));
  });

  it("upserts detailed Pin metrics, records progress, and is idempotent on correction", async () => {
    const account = await createAccount();
    const pin = await prisma.growthPinterestPin.create({ data: { accountId: account.id, pinterestPinId: "500", lastSeenAt: new Date(), lastSyncedAt: new Date() } });
    await prisma.growthPinterestAnalyticsState.create({ data: {
      accountId: account.id, status: "BACKFILLING", backfillPinsTotal: 1,
      backfillStartedAt: new Date("2026-10-05T12:00:00Z"),
      lastInventorySyncAt: new Date("2026-10-05T12:00:03Z"),
      lastAccountAnalyticsSyncAt: new Date("2026-10-05T12:00:03Z"),
    } });
    const body = (outbound: number) => ({ all: { daily_metrics: [{ date: "2026-10-05", data_status: "READY", metrics: { IMPRESSION: 0, SAVE: 0, PIN_CLICK: 0, OUTBOUND_CLICK: outbound } }] } });
    await syncPinterestPinAnalytics({ accountId: account.id, startDate: "2026-10-05", endDate: "2026-10-05", runStartedAt: "2026-10-05T12:00:01.000Z", batch: 0, fetchImpl: vi.fn().mockResolvedValue(response(body(0))) });
    await prisma.growthPinterestPin.update({ where: { id: pin.id }, data: { lastAnalyticsSyncAt: null } });
    await syncPinterestPinAnalytics({ accountId: account.id, startDate: "2026-10-05", endDate: "2026-10-05", runStartedAt: "2026-10-05T12:00:02.000Z", batch: 0, fetchImpl: vi.fn().mockResolvedValue(response(body(2))) });
    expect(await prisma.growthPinterestPinMetricDaily.count()).toBe(1);
    expect((await prisma.growthPinterestPinMetricDaily.findFirstOrThrow()).outboundClicks).toBe(BigInt(2));
    expect((await prisma.growthPinterestAnalyticsState.findUniqueOrThrow({ where: { accountId: account.id } })).backfillCompletedAt).not.toBeNull();
  });

  it("deduplicates manual sync jobs and resumes with continuation jobs", async () => {
    const account = await createAccount();
    const now = new Date("2026-10-05T12:34:00Z");
    const [first, second] = await Promise.all([enqueuePinterestAnalyticsSync(account.id, now), enqueuePinterestAnalyticsSync(account.id, now)]);
    expect(first.account.job.id).toBe(second.account.job.id);
    expect(first.inventory.job.id).toBe(second.inventory.job.id);
    expect(await prisma.growthJob.count()).toBe(2);
  });

  it("ranks Pins by outbound clicks, aggregates a date range, and keeps zero-impression CTR safe", async () => {
    const account = await createAccount();
    const [first, second] = await Promise.all([
      prisma.growthPinterestPin.create({ data: { accountId: account.id, pinterestPinId: "600", title: "First", lastSeenAt: new Date(), lastSyncedAt: new Date() } }),
      prisma.growthPinterestPin.create({ data: { accountId: account.id, pinterestPinId: "601", title: "Second", lastSeenAt: new Date(), lastSyncedAt: new Date() } }),
    ]);
    const metricDate = new Date(); metricDate.setUTCHours(0, 0, 0, 0);
    await prisma.growthPinterestAccountMetricDaily.create({ data: { accountId: account.id, metricDate, impressions: 0, outboundClicks: 7, dataStatus: "READY", fetchedAt: new Date() } });
    await prisma.growthPinterestPinMetricDaily.createMany({ data: [
      { pinId: first.id, metricDate, impressions: 100, outboundClicks: 2, dataStatus: "READY", fetchedAt: new Date() },
      { pinId: second.id, metricDate, impressions: 0, outboundClicks: 9, dataStatus: "READY", fetchedAt: new Date() },
    ] });
    const report = await getPinterestAnalyticsDashboard({ accountId: account.id, rangeDays: 7 });
    expect(report.totals.outboundClicks).toBe(BigInt(7));
    expect(report.pins.map((pin) => pin.pinterestPinId)).toEqual(["601", "600"]);
    expect(report.pins[0].outboundClickRate).toBe(0);
  });
});
