import { randomBytes, randomUUID } from "node:crypto";
import {
  GrowthIntensity,
  GrowthJobType,
  GrowthPinterestAnalyticsStatus,
  GrowthPinterestApiEnvironment,
  GrowthPinterestConnectionStatus,
  GrowthPinterestPublicationRole,
  Role,
} from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { enqueueGrowthJob } from "@/lib/growth/jobs";
import {
  enqueuePinterestAnalyticsSync,
  syncPinterestPinAnalytics,
  syncPinterestPinInventory,
} from "@/lib/growth/pinterest/analytics";
import { encryptPinterestCredentials } from "@/lib/growth/pinterest/credentials";
import {
  DEFAULT_OWNED_PINTEREST_DOMAINS,
  reclassifyPinterestPins,
} from "@/lib/growth/pinterest/relevance";
import { updateGrowthSettings } from "@/lib/growth/settings";
import { prisma } from "@/lib/prisma";

const enabled = process.env.RUN_GROWTH_RELEVANCE_DB_TESTS === "1";
const databaseDescribe = enabled ? describe.sequential : describe.skip;
const requiredDatabaseName = "saytwist_growth_phase4_relevance_test";
const encryptionKey = randomBytes(32).toString("base64");

if (enabled) {
  const explicitUrl = process.env.GROWTH_RELEVANCE_TEST_DATABASE_URL;
  if (!explicitUrl || process.env.DATABASE_URL !== explicitUrl) throw new Error("Growth relevance DB tests require matching explicit test database URLs.");
  const parsed = new URL(explicitUrl);
  if (!["localhost", "127.0.0.1", "::1"].includes(parsed.hostname) || decodeURIComponent(parsed.pathname.slice(1)) !== requiredDatabaseName) {
    throw new Error(`Growth relevance DB tests refuse every target except local database ${requiredDatabaseName}.`);
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
  await prisma.growthSettings.deleteMany();
  await prisma.user.deleteMany();
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

function response(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "x-ratelimit-limit": "60", "x-ratelimit-remaining": "59" } });
}

beforeAll(() => {
  vi.stubEnv("PINTEREST_APP_ID", "relevance-app");
  vi.stubEnv("PINTEREST_APP_SECRET", "relevance-secret");
  vi.stubEnv("PINTEREST_REDIRECT_URI", "http://localhost:3000/api/admin/growth/pinterest/oauth/callback");
  vi.stubEnv("PINTEREST_API_ENVIRONMENT", "production");
  vi.stubEnv("GROWTH_CREDENTIAL_ENCRYPTION_KEY", encryptionKey);
});
beforeEach(clean);
afterAll(async () => { if (enabled) await clean(); vi.unstubAllEnvs(); await prisma.$disconnect(); });

databaseDescribe("Pinterest Phase 4 relevance persistence", () => {
  it("applies the approved default owned domains to a new settings singleton", async () => {
    const settings = await prisma.growthSettings.create({ data: { id: "global" } });
    expect(settings.ownedDomains).toEqual(DEFAULT_OWNED_PINTEREST_DOMAINS);
  });

  it("bulk-upserts a full 250-Pin page and safely updates metadata, board, nulls, eligibility, activity, and timestamps", async () => {
    const account = await createAccount();
    const [firstBoard, secondBoard] = await Promise.all([
      prisma.growthPinterestBoard.create({ data: { accountId: account.id, pinterestBoardId: "board-1", name: "One", lastSeenAt: new Date(), lastSyncedAt: new Date() } }),
      prisma.growthPinterestBoard.create({ data: { accountId: account.id, pinterestBoardId: "board-2", name: "Two", lastSeenAt: new Date(), lastSyncedAt: new Date() } }),
    ]);
    await enqueuePinterestAnalyticsSync(account.id, new Date("2026-10-06T10:00:00Z"));
    const pins = Array.from({ length: 250 }, (_, index) => ({
      id: String(10_000 + index), board_id: firstBoard.pinterestBoardId,
      title: `Pin ${index}`, description: index === 0 ? null : "Description",
      link: index % 3 === 0 ? `https://saytwist.com/p/${index}` : "https://example.com/legacy",
      created_at: "2026-10-01T00:00:00Z",
    }));
    await syncPinterestPinInventory({
      accountId: account.id, startDate: "2026-07-09", endDate: "2026-10-06",
      runStartedAt: "2026-10-06T10:00:00.000Z", fetchImpl: vi.fn().mockResolvedValue(response({ items: pins, bookmark: null })),
    });
    expect(await prisma.growthPinterestPin.count({ where: { accountId: account.id } })).toBe(250);
    expect(await prisma.growthPinterestPin.count({ where: { accountId: account.id, analyticsEligible: true } })).toBe(84);
    const inserted = await prisma.growthPinterestPin.findUniqueOrThrow({ where: { pinterestPinId: "10000" } });
    const analyticsTimestamp = new Date("2026-10-06T10:30:00Z");
    const priorityTimestamp = new Date("2026-10-06T10:20:00Z");
    const before = await prisma.growthPinterestPin.update({
      where: { id: inserted.id },
      data: {
        isActive: false, lastAnalyticsSyncAt: analyticsTimestamp, analyticsPriorityAt: priorityTimestamp,
        summaryStartDate: new Date("2026-09-01T00:00:00Z"), summaryEndDate: new Date("2026-10-01T00:00:00Z"),
        summaryFetchedAt: analyticsTimestamp, summaryImpressions: 40, summarySaves: 3,
        summaryPinClicks: 5, summaryOutboundClicks: 2,
      },
    });
    await prisma.growthPinterestPinMetricDaily.create({ data: {
      pinId: before.id, metricDate: new Date("2026-10-01T00:00:00Z"), impressions: 4,
      dataStatus: "READY", fetchedAt: analyticsTimestamp,
    } });

    pins[0] = {
      ...pins[0], board_id: secondBoard.pinterestBoardId, title: "Changed", description: null,
      link: "https://example.com/no-longer-owned", created_at: "2026-10-02T00:00:00Z",
    };
    await syncPinterestPinInventory({
      accountId: account.id, startDate: "2026-07-09", endDate: "2026-10-06",
      runStartedAt: "2026-10-06T11:00:00.000Z", fetchImpl: vi.fn().mockResolvedValue(response({ items: pins, bookmark: null })),
    });
    const changed = await prisma.growthPinterestPin.findUniqueOrThrow({ where: { pinterestPinId: "10000" } });
    expect(await prisma.growthPinterestPin.count({ where: { accountId: account.id } })).toBe(250);
    expect(changed).toMatchObject({
      id: before.id, boardId: secondBoard.id, pinterestBoardId: "board-2", title: "Changed",
      description: null, analyticsEligible: false, isActive: true,
    });
    expect(changed.createdAt).toEqual(before.createdAt);
    expect(changed.updatedAt.getTime()).toBeGreaterThanOrEqual(before.updatedAt.getTime());
    expect(changed.publishedAt?.toISOString()).toBe("2026-10-02T00:00:00.000Z");
    expect(changed).toMatchObject({
      lastAnalyticsSyncAt: analyticsTimestamp, analyticsPriorityAt: priorityTimestamp,
      summaryImpressions: 40n, summarySaves: 3n, summaryPinClicks: 5n, summaryOutboundClicks: 2n,
    });
    expect(await prisma.growthPinterestPinMetricDaily.count({ where: { pinId: changed.id } })).toBe(1);
  });

  it("reclassifies stored inventory and reconciles eligible progress without deleting historical metrics", async () => {
    const account = await createAccount();
    const admin = await prisma.user.create({ data: { email: "relevance-admin@example.com", passwordHash: "test", role: Role.ADMIN } });
    await prisma.growthSettings.create({ data: { id: "global" } });
    const pins = await Promise.all([
      prisma.growthPinterestPin.create({ data: { accountId: account.id, pinterestPinId: "current", destinationUrl: "https://saytwist.com/a", lastAnalyticsSyncAt: new Date(), lastSeenAt: new Date(), lastSyncedAt: new Date() } }),
      prisma.growthPinterestPin.create({ data: { accountId: account.id, pinterestPinId: "legacy", destinationUrl: "https://translator.whattypeof.com/a", lastSeenAt: new Date(), lastSyncedAt: new Date() } }),
      prisma.growthPinterestPin.create({ data: { accountId: account.id, pinterestPinId: "other", destinationUrl: "https://example.com/a", lastAnalyticsSyncAt: new Date(), lastSeenAt: new Date(), lastSyncedAt: new Date() } }),
      prisma.growthPinterestPin.create({ data: { accountId: account.id, pinterestPinId: "none", destinationUrl: null, lastSeenAt: new Date(), lastSyncedAt: new Date() } }),
    ]);
    await prisma.growthPinterestAnalyticsState.create({ data: { accountId: account.id, status: GrowthPinterestAnalyticsStatus.BACKFILLING, backfillPinsTotal: 720, backfillPinsProcessed: 8 } });
    await prisma.growthPinterestPinMetricDaily.create({ data: { pinId: pins[2].id, metricDate: new Date("2026-10-05T00:00:00Z"), impressions: 1, dataStatus: "READY", fetchedAt: new Date() } });

    await reclassifyPinterestPins(account.id, DEFAULT_OWNED_PINTEREST_DOMAINS);
    expect(await prisma.growthPinterestPin.count({ where: { analyticsEligible: true } })).toBe(2);
    expect(await prisma.growthPinterestAnalyticsState.findUniqueOrThrow({ where: { accountId: account.id } })).toMatchObject({ backfillPinsTotal: 2, backfillPinsProcessed: 1 });

    await updateGrowthSettings({ enabled: false, intensity: GrowthIntensity.BALANCED, workerBatchSize: 5, ownedDomains: ["saytwist.com"] }, admin.id);
    expect(await prisma.growthPinterestPin.count({ where: { analyticsEligible: true } })).toBe(1);
    expect(await prisma.growthPinterestPinMetricDaily.count()).toBe(1);
    expect(await prisma.growthPinterestAnalyticsState.findUniqueOrThrow({ where: { accountId: account.id } })).toMatchObject({ backfillPinsTotal: 1, backfillPinsProcessed: 1 });
  });

  it("queues or skips inventory according to completion freshness and partial state", async () => {
    const cases = [
      { name: "never", last: null, status: GrowthPinterestAnalyticsStatus.NEVER_SYNCED, skipped: false },
      { name: "five-minutes", last: new Date("2026-10-06T11:55:00Z"), status: GrowthPinterestAnalyticsStatus.FRESH, skipped: true },
      { name: "twenty-three-hours", last: new Date("2026-10-05T13:00:00Z"), status: GrowthPinterestAnalyticsStatus.FRESH, skipped: true },
      { name: "stale", last: new Date("2026-10-05T11:59:59Z"), status: GrowthPinterestAnalyticsStatus.STALE, skipped: false },
      { name: "partial", last: new Date("2026-10-06T11:55:00Z"), status: GrowthPinterestAnalyticsStatus.PARTIAL, skipped: false },
    ];
    for (const item of cases) {
      const account = await createAccount();
      if (item.last) await prisma.growthPinterestAnalyticsState.create({ data: { accountId: account.id, status: item.status, lastInventorySyncAt: item.last } });
      const result = await enqueuePinterestAnalyticsSync(account.id, new Date("2026-10-06T12:00:00Z"));
      expect(result.inventorySkipped, item.name).toBe(item.skipped);
      expect(Boolean(result.inventory), item.name).toBe(!item.skipped);
      expect(Boolean(result.pin), item.name).toBe(item.skipped);
      if (item.name === "five-minutes") {
        expect(result.pin?.job.payload).toMatchObject({ relevancePrepared: true });
        const repeated = await enqueuePinterestAnalyticsSync(account.id, new Date("2026-10-06T12:00:00Z"));
        expect(repeated.pin?.created).toBe(false);
        expect(await prisma.growthJob.count({ where: {
          type: GrowthJobType.PINTEREST_PIN_ANALYTICS_SYNC,
          payload: { path: ["accountId"], equals: account.id },
        } })).toBe(1);
      }
      await prisma.growthPinterestAccount.delete({ where: { id: account.id } });
    }
  });

  it("runs an old queued continuation against current eligibility and completes on eligible progress only", async () => {
    const account = await createAccount();
    const now = new Date("2026-10-06T12:00:00Z");
    const eligiblePins = await Promise.all(Array.from({ length: 9 }, (_, index) => prisma.growthPinterestPin.create({ data: {
      accountId: account.id, pinterestPinId: String(7_001 + index), destinationUrl: `https://saytwist.com/${index}`,
      lastSeenAt: now, lastSyncedAt: now,
    } })));
    const unrelated = await prisma.growthPinterestPin.create({ data: { accountId: account.id, pinterestPinId: "7999", destinationUrl: "https://example.com/a", lastAnalyticsSyncAt: now, lastSeenAt: now, lastSyncedAt: now } });
    await prisma.growthPinterestAnalyticsState.create({ data: {
      accountId: account.id, status: GrowthPinterestAnalyticsStatus.BACKFILLING,
      backfillPinsTotal: 720, backfillPinsProcessed: 8,
      lastInventorySyncAt: new Date("2026-10-06T11:55:00Z"),
      lastAccountAnalyticsSyncAt: new Date("2026-10-06T12:00:01Z"),
    } });
    await enqueueGrowthJob({
      type: GrowthJobType.PINTEREST_PIN_ANALYTICS_SYNC,
      idempotencyKey: "old-720-pin-continuation",
      payload: { accountId: account.id, startDate: "2026-07-09", endDate: "2026-10-06", runStartedAt: now.toISOString(), batch: 8 },
    });
    await prisma.growthPinterestPinMetricDaily.create({ data: { pinId: unrelated.id, metricDate: new Date("2026-10-05T00:00:00Z"), impressions: 3, dataStatus: "READY", fetchedAt: now } });
    const fetchMock = vi.fn().mockImplementation(async () => response({ all: { daily_metrics: [] } }));
    await expect(syncPinterestPinAnalytics({
      accountId: account.id, startDate: "2026-07-09", endDate: "2026-10-06", runStartedAt: now.toISOString(), batch: 8, fetchImpl: fetchMock,
    })).resolves.toMatchObject({ processed: 8, remaining: 1, complete: false });
    expect(fetchMock).toHaveBeenCalledTimes(8);
    const firstBatchUrls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(firstBatchUrls.every((url) => eligiblePins.some((pin) => url.includes(`/pins/${pin.pinterestPinId}/analytics`)))).toBe(true);
    expect(firstBatchUrls.every((url) => !url.includes(`/pins/${unrelated.pinterestPinId}/analytics`))).toBe(true);
    expect(await prisma.growthPinterestPinMetricDaily.count({ where: { pinId: unrelated.id } })).toBe(1);
    const generatedContinuation = await prisma.growthJob.findFirst({
      where: { type: GrowthJobType.PINTEREST_PIN_ANALYTICS_SYNC, idempotencyKey: { not: "old-720-pin-continuation" } },
    });
    expect(generatedContinuation?.payload).toMatchObject({ relevancePrepared: true, batch: 9 });
    await expect(syncPinterestPinAnalytics({
      accountId: account.id, startDate: "2026-07-09", endDate: "2026-10-06",
      runStartedAt: now.toISOString(), batch: 9, relevancePrepared: true, fetchImpl: fetchMock,
    })).resolves.toMatchObject({ processed: 1, remaining: 0, complete: true });
    expect(fetchMock).toHaveBeenCalledTimes(9);
    expect(await prisma.growthPinterestAnalyticsState.findUniqueOrThrow({ where: { accountId: account.id } })).toMatchObject({
      status: GrowthPinterestAnalyticsStatus.FRESH, backfillPinsTotal: 9, backfillPinsProcessed: 9,
    });
  });

  it("completes cleanly with zero eligible Pins and makes no individual analytics request", async () => {
    const account = await createAccount();
    const now = new Date("2026-10-06T12:00:00Z");
    await prisma.growthPinterestPin.createMany({ data: [
      { accountId: account.id, pinterestPinId: "8001", destinationUrl: "https://example.com/a", lastSeenAt: now, lastSyncedAt: now },
      { accountId: account.id, pinterestPinId: "8002", destinationUrl: null, lastSeenAt: now, lastSyncedAt: now },
    ] });
    await prisma.growthPinterestAnalyticsState.create({ data: {
      accountId: account.id, status: GrowthPinterestAnalyticsStatus.BACKFILLING,
      backfillPinsTotal: 720, backfillPinsProcessed: 8,
      lastInventorySyncAt: new Date("2026-10-06T11:55:00Z"),
      lastAccountAnalyticsSyncAt: new Date("2026-10-06T12:00:01Z"),
    } });
    await reclassifyPinterestPins(account.id, DEFAULT_OWNED_PINTEREST_DOMAINS);
    const fetchMock = vi.fn();
    await expect(syncPinterestPinAnalytics({
      accountId: account.id, startDate: "2026-07-09", endDate: "2026-10-06",
      runStartedAt: now.toISOString(), batch: 0, relevancePrepared: true, fetchImpl: fetchMock,
    })).resolves.toEqual({ processed: 0, remaining: 0, complete: true });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await prisma.growthJob.count({ where: { type: GrowthJobType.PINTEREST_PIN_ANALYTICS_SYNC } })).toBe(0);
    expect(await prisma.growthPinterestAnalyticsState.findUniqueOrThrow({ where: { accountId: account.id } })).toMatchObject({
      status: GrowthPinterestAnalyticsStatus.FRESH, backfillPinsTotal: 0, backfillPinsProcessed: 0,
    });
  });

  it("uses persisted eligibility after settings change while a prepared continuation is queued", async () => {
    const account = await createAccount();
    const admin = await prisma.user.create({ data: { email: "chain-admin@example.com", passwordHash: "test", role: Role.ADMIN } });
    await prisma.growthSettings.create({ data: { id: "global" } });
    const now = new Date("2026-10-06T12:00:00Z");
    const formerlyEligible = await prisma.growthPinterestPin.create({ data: {
      accountId: account.id, pinterestPinId: "9001", destinationUrl: "https://saytwist.com/a",
      analyticsEligible: true, lastAnalyticsSyncAt: now, lastSeenAt: now, lastSyncedAt: now,
    } });
    const newlyEligible = await prisma.growthPinterestPin.create({ data: {
      accountId: account.id, pinterestPinId: "9002", destinationUrl: "https://example.com/a",
      analyticsEligible: false, lastSeenAt: now, lastSyncedAt: now,
    } });
    await prisma.growthPinterestAnalyticsState.create({ data: {
      accountId: account.id, status: GrowthPinterestAnalyticsStatus.BACKFILLING,
      backfillPinsTotal: 1, backfillPinsProcessed: 1,
      lastInventorySyncAt: new Date("2026-10-06T11:55:00Z"),
      lastAccountAnalyticsSyncAt: new Date("2026-10-06T12:00:01Z"),
    } });
    await prisma.growthPinterestPinMetricDaily.create({ data: {
      pinId: formerlyEligible.id, metricDate: new Date("2026-10-05T00:00:00Z"), impressions: 3,
      dataStatus: "READY", fetchedAt: now,
    } });
    await enqueueGrowthJob({
      type: GrowthJobType.PINTEREST_PIN_ANALYTICS_SYNC, idempotencyKey: "prepared-before-settings-change",
      payload: { accountId: account.id, startDate: "2026-07-09", endDate: "2026-10-06", runStartedAt: now.toISOString(), batch: 1, relevancePrepared: true },
    });
    const externalFetch = vi.spyOn(globalThis, "fetch");
    await updateGrowthSettings({ enabled: false, intensity: GrowthIntensity.BALANCED, workerBatchSize: 5, ownedDomains: ["example.com"] }, admin.id);
    expect(externalFetch).not.toHaveBeenCalled();
    externalFetch.mockRestore();
    expect((await prisma.growthPinterestPin.findUniqueOrThrow({ where: { id: formerlyEligible.id } })).analyticsEligible).toBe(false);
    expect((await prisma.growthPinterestPin.findUniqueOrThrow({ where: { id: newlyEligible.id } })).analyticsEligible).toBe(true);
    expect(await prisma.growthPinterestPinMetricDaily.count({ where: { pinId: formerlyEligible.id } })).toBe(1);

    const fetchMock = vi.fn().mockResolvedValue(response({ all: { daily_metrics: [] } }));
    await syncPinterestPinAnalytics({
      accountId: account.id, startDate: "2026-07-09", endDate: "2026-10-06",
      runStartedAt: now.toISOString(), batch: 1, relevancePrepared: true, fetchImpl: fetchMock,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain(`/pins/${newlyEligible.pinterestPinId}/analytics`);
    expect(await prisma.growthPinterestPinMetricDaily.count({ where: { pinId: formerlyEligible.id } })).toBe(1);
  });
});
