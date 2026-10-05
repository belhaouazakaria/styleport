import { createHash } from "node:crypto";

import {
  GrowthActivityActorKind,
  GrowthJobType,
  GrowthPinterestAnalyticsStatus,
} from "@prisma/client";

import { recordGrowthActivity } from "@/lib/growth/activity";
import { enqueueGrowthJob } from "@/lib/growth/jobs";
import {
  defaultBackfillRange,
  defaultRefreshRange,
  metricCount,
  PINTEREST_INVENTORY_MAX_PAGES,
  PINTEREST_INVENTORY_MAX_PINS,
  PINTEREST_INVENTORY_REQUESTS_PER_JOB,
  PINTEREST_PIN_REQUESTS_PER_JOB,
} from "@/lib/growth/pinterest/analytics-contract";
import {
  getPinterestAccountAnalytics,
  getPinterestPinAnalytics,
  getPinterestPinsPage,
  getPinterestTopPinsAnalytics,
  type PinterestRateLimitMetadata,
} from "@/lib/growth/pinterest/api";
import type { PinterestPin } from "@/lib/growth/pinterest/schemas";
import { toSafeGrowthError } from "@/lib/growth/safe-data";
import { prisma } from "@/lib/prisma";

function continuationKey(parts: string[]) {
  const digest = createHash("sha256").update(parts.join(":"), "utf8").digest("hex").slice(0, 24);
  return `pinterest:analytics:continue:${digest}`;
}

function lowRateLimit(metadata: PinterestRateLimitMetadata) {
  const remaining = Number(metadata.remaining);
  return Number.isFinite(remaining) && remaining <= 5;
}

function rateLimitData(metadata: PinterestRateLimitMetadata, now = new Date()) {
  return {
    lastRateLimitLimit: metadata.limit?.slice(0, 191) || null,
    lastRateLimitRemaining: metadata.remaining?.slice(0, 191) || null,
    lastRateLimitReset: metadata.reset?.slice(0, 191) || null,
    rateLimitObservedAt: now,
  };
}

function previewUrl(pin: PinterestPin) {
  const images = pin.media?.images;
  const candidate = images?.["150x150"]?.url || images?.["400x300"]?.url || images?.["600x"]?.url;
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" && (url.hostname === "pinimg.com" || url.hostname.endsWith(".pinimg.com")) ? url.toString() : null;
  } catch {
    return null;
  }
}

function blockDailyMetrics(data: Record<string, { daily_metrics: Array<{ date: string; data_status: string; metrics: Record<string, number> }> }>) {
  return data.all?.daily_metrics || [];
}

function assertRowsInRange(rows: Array<{ date: string }>, startDate: string, endDate: string) {
  if (rows.some((row) => row.date < startDate || row.date > endDate)) {
    throw new Error("Pinterest returned a daily metric outside the requested date range.");
  }
}

export async function enqueuePinterestAnalyticsSync(accountId: string, now = new Date()) {
  const current = await prisma.growthPinterestAnalyticsState.findUnique({ where: { accountId } });
  const range = current?.backfillCompletedAt ? defaultRefreshRange(now) : defaultBackfillRange(now);
  const runStartedAt = now.toISOString();
  const bucket = Math.floor(now.getTime() / 60_000);
  await prisma.growthPinterestAnalyticsState.upsert({
    where: { accountId },
    create: {
      accountId,
      status: GrowthPinterestAnalyticsStatus.BACKFILLING,
      backfillStartDate: new Date(`${range.startDate}T00:00:00.000Z`),
      backfillEndDate: new Date(`${range.endDate}T00:00:00.000Z`),
      backfillStartedAt: now,
      lastAttemptAt: now,
    },
    update: {
      status: current?.backfillCompletedAt ? GrowthPinterestAnalyticsStatus.PARTIAL : GrowthPinterestAnalyticsStatus.BACKFILLING,
      backfillStartDate: new Date(`${range.startDate}T00:00:00.000Z`),
      backfillEndDate: new Date(`${range.endDate}T00:00:00.000Z`),
      backfillStartedAt: current?.backfillCompletedAt ? current.backfillStartedAt : (current?.backfillStartedAt || now),
      lastAttemptAt: now,
      lastError: null,
    },
  });
  const payload = { accountId, ...range, runStartedAt };
  const [account, inventory] = await Promise.all([
    enqueueGrowthJob({
      type: GrowthJobType.PINTEREST_ACCOUNT_ANALYTICS_SYNC,
      idempotencyKey: `pinterest:account-analytics:${accountId}:${bucket}`,
      payload,
    }),
    enqueueGrowthJob({
      type: GrowthJobType.PINTEREST_PIN_INVENTORY_SYNC,
      idempotencyKey: `pinterest:pin-inventory:${accountId}:${bucket}`,
      payload,
    }),
  ]);
  return { account, inventory, range };
}

export async function syncPinterestPinInventory(params: {
  accountId: string; startDate: string; endDate: string; runStartedAt: string; fetchImpl?: typeof fetch;
}) {
  const now = new Date();
  const state = await prisma.growthPinterestAnalyticsState.upsert({
    where: { accountId: params.accountId },
    create: { accountId: params.accountId, status: GrowthPinterestAnalyticsStatus.BACKFILLING, inventoryStartedAt: now, lastAttemptAt: now },
    update: { lastAttemptAt: now },
  });
  const startedAt = state.inventoryStartedAt || now;
  let bookmark = state.inventoryBookmark || undefined;
  let pageCount = state.inventoryPageCount;
  let pinCount = state.inventoryPinCount;
  const seen = new Set(state.inventorySeenBookmarks);
  let lastRateLimit: PinterestRateLimitMetadata = { limit: null, remaining: null, reset: null };

  try {
    for (let request = 0; request < PINTEREST_INVENTORY_REQUESTS_PER_JOB; request += 1) {
      if (pageCount >= PINTEREST_INVENTORY_MAX_PAGES) throw new Error("Pinterest Pin inventory exceeded the 10-page safety limit.");
      const response = await getPinterestPinsPage(params.accountId, bookmark, params.fetchImpl);
      lastRateLimit = response.rateLimit;
      pageCount += 1;
      pinCount += response.data.items.length;
      if (pinCount > PINTEREST_INVENTORY_MAX_PINS) throw new Error("Pinterest Pin inventory exceeded the 2500-Pin safety limit.");
      const syncedAt = new Date();
      const pinterestBoardIds = [...new Set(response.data.items.map((pin) => pin.board_id).filter((id): id is string => Boolean(id)))];
      const resolvedBoards = pinterestBoardIds.length ? await prisma.growthPinterestBoard.findMany({
        where: { accountId: params.accountId, pinterestBoardId: { in: pinterestBoardIds } },
        select: { id: true, pinterestBoardId: true },
      }) : [];
      const boardIds = new Map(resolvedBoards.map((board) => [board.pinterestBoardId, board.id]));
      await prisma.$transaction(async (tx) => {
        for (const pin of response.data.items) {
          const values = {
            accountId: params.accountId,
            boardId: pin.board_id ? boardIds.get(pin.board_id) || null : null,
            pinterestBoardId: pin.board_id || null,
            title: pin.title || null,
            description: pin.description || null,
            destinationUrl: pin.link || null,
            creativeType: pin.creative_type || null,
            mediaType: pin.media?.media_type || null,
            previewImageUrl: previewUrl(pin),
            publishedAt: pin.created_at ? new Date(pin.created_at) : null,
            isActive: true,
            lastSeenAt: syncedAt,
            lastSyncedAt: syncedAt,
          };
          await tx.growthPinterestPin.upsert({
            where: { pinterestPinId: pin.id },
            create: { pinterestPinId: pin.id, ...values },
            update: values,
          });
        }
      });
      const next = response.data.bookmark || undefined;
      if (!next) {
        const completedAt = new Date();
        const activePins = await prisma.$transaction(async (tx) => {
          await tx.growthPinterestPin.updateMany({
            where: { accountId: params.accountId, lastSeenAt: { lt: startedAt } },
            data: { isActive: false },
          });
          const count = await tx.growthPinterestPin.count({ where: { accountId: params.accountId, isActive: true } });
          await tx.growthPinterestAnalyticsState.update({
            where: { accountId: params.accountId },
            data: {
              inventoryBookmark: null, inventoryStartedAt: null, inventoryPageCount: 0,
              inventoryPinCount: 0, inventorySeenBookmarks: [], lastInventorySyncAt: completedAt,
              lastSuccessfulSyncAt: completedAt, backfillPinsTotal: count,
              ...rateLimitData(lastRateLimit, completedAt),
            },
          });
          return count;
        });
        await enqueueGrowthJob({
          type: GrowthJobType.PINTEREST_PIN_ANALYTICS_SYNC,
          idempotencyKey: continuationKey([params.accountId, params.runStartedAt, "pins", "0"]),
          payload: { accountId: params.accountId, startDate: params.startDate, endDate: params.endDate, runStartedAt: params.runStartedAt, batch: 0 },
        });
        return { complete: true, pages: pageCount, pins: activePins };
      }
      if (seen.has(next)) throw new Error("Pinterest Pin inventory repeated a bookmark.");
      seen.add(next);
      bookmark = next;
      await prisma.growthPinterestAnalyticsState.update({
        where: { accountId: params.accountId },
        data: {
          inventoryBookmark: bookmark, inventoryStartedAt: startedAt, inventoryPageCount: pageCount,
          inventoryPinCount: pinCount, inventorySeenBookmarks: [...seen],
          ...rateLimitData(lastRateLimit),
        },
      });
      if (lowRateLimit(lastRateLimit)) break;
    }
    await enqueueGrowthJob({
      type: GrowthJobType.PINTEREST_PIN_INVENTORY_SYNC,
      idempotencyKey: continuationKey([params.accountId, params.runStartedAt, "inventory", String(pageCount), bookmark || "end"]),
      payload: { accountId: params.accountId, startDate: params.startDate, endDate: params.endDate, runStartedAt: params.runStartedAt },
    });
    return { complete: false, pages: pageCount, pins: pinCount };
  } catch (error) {
    await markAnalyticsFailure(params.accountId, error, GrowthPinterestAnalyticsStatus.PARTIAL);
    throw error;
  }
}

export async function syncPinterestAccountAnalytics(params: {
  accountId: string; startDate: string; endDate: string; fetchImpl?: typeof fetch;
}) {
  try {
    const accountResponse = await getPinterestAccountAnalytics(params);
    const rows = blockDailyMetrics(accountResponse.data);
    assertRowsInRange(rows, params.startDate, params.endDate);
    const fetchedAt = new Date();
    await prisma.$transaction(async (tx) => {
      for (const row of rows) {
        const values = {
          impressions: metricCount(row.metrics, "IMPRESSION"), saves: metricCount(row.metrics, "SAVE"),
          pinClicks: metricCount(row.metrics, "PIN_CLICK"), outboundClicks: metricCount(row.metrics, "OUTBOUND_CLICK"),
          engagements: metricCount(row.metrics, "ENGAGEMENT"), dataStatus: row.data_status, fetchedAt,
        };
        await tx.growthPinterestAccountMetricDaily.upsert({
          where: { accountId_metricDate: { accountId: params.accountId, metricDate: new Date(`${row.date}T00:00:00.000Z`) } },
          create: { accountId: params.accountId, metricDate: new Date(`${row.date}T00:00:00.000Z`), ...values },
          update: values,
        });
      }
    });

    let topCount = 0;
    let finalRateLimit = accountResponse.rateLimit;
    if (!lowRateLimit(accountResponse.rateLimit)) {
      const topResponse = await getPinterestTopPinsAnalytics(params);
      finalRateLimit = topResponse.rateLimit;
      topCount = topResponse.data.pins.length;
      await prisma.$transaction(async (tx) => {
        for (const top of topResponse.data.pins) {
          const values = {
            analyticsPriorityAt: fetchedAt,
            summaryStartDate: new Date(`${params.startDate}T00:00:00.000Z`),
            summaryEndDate: new Date(`${params.endDate}T00:00:00.000Z`),
            summaryFetchedAt: fetchedAt,
            summaryImpressions: metricCount(top.metrics, "IMPRESSION"),
            summarySaves: metricCount(top.metrics, "SAVE"),
            summaryPinClicks: metricCount(top.metrics, "PIN_CLICK"),
            summaryOutboundClicks: metricCount(top.metrics, "OUTBOUND_CLICK"),
          };
          await tx.growthPinterestPin.upsert({
            where: { pinterestPinId: top.pin_id },
            create: {
              pinterestPinId: top.pin_id, accountId: params.accountId, isActive: true,
              lastSeenAt: fetchedAt, lastSyncedAt: fetchedAt, ...values,
            },
            update: values,
          });
        }
        const activePinCount = await tx.growthPinterestPin.count({ where: { accountId: params.accountId, isActive: true } });
        await tx.growthPinterestAnalyticsState.update({
          where: { accountId: params.accountId }, data: { backfillPinsTotal: activePinCount },
        });
      });
    }
    await prisma.growthPinterestAnalyticsState.update({
      where: { accountId: params.accountId },
      data: { lastAccountAnalyticsSyncAt: fetchedAt, lastSuccessfulSyncAt: fetchedAt, lastError: null, ...rateLimitData(finalRateLimit, fetchedAt) },
    });
    await recordGrowthActivity({
      actorKind: GrowthActivityActorKind.WORKER, entityType: "GrowthPinterestAccount", entityId: params.accountId,
      action: "PINTEREST_ACCOUNT_ANALYTICS_SYNC_COMPLETED", summary: { dailyRows: rows.length, topPins: topCount, startDate: params.startDate, endDate: params.endDate },
    });
    return { dailyRows: rows.length, topPins: topCount };
  } catch (error) {
    await markAnalyticsFailure(params.accountId, error);
    throw error;
  }
}

export async function syncPinterestPinAnalytics(params: {
  accountId: string; startDate: string; endDate: string; runStartedAt: string; batch: number; fetchImpl?: typeof fetch;
}) {
  const cutoff = new Date(params.runStartedAt);
  try {
    const analyticsState = await prisma.growthPinterestAnalyticsState.findUniqueOrThrow({ where: { accountId: params.accountId } });
    const isInitialBackfill = !analyticsState.backfillCompletedAt;
    const analyticsDue = isInitialBackfill
      ? { lastAnalyticsSyncAt: null }
      : { OR: [{ lastAnalyticsSyncAt: null }, { lastAnalyticsSyncAt: { lt: cutoff } }] };
    const pins = await prisma.growthPinterestPin.findMany({
      where: { accountId: params.accountId, isActive: true, ...analyticsDue },
      orderBy: [{ analyticsPriorityAt: { sort: "desc", nulls: "last" } }, { lastAnalyticsSyncAt: { sort: "asc", nulls: "first" } }, { publishedAt: "desc" }],
      take: PINTEREST_PIN_REQUESTS_PER_JOB,
      select: { id: true, pinterestPinId: true },
    });
    let processed = 0;
    let lastRateLimit: PinterestRateLimitMetadata = { limit: null, remaining: null, reset: null };
    for (const pin of pins) {
      const response = await getPinterestPinAnalytics({ ...params, pinterestPinId: pin.pinterestPinId });
      lastRateLimit = response.rateLimit;
      const rows = blockDailyMetrics(response.data);
      assertRowsInRange(rows, params.startDate, params.endDate);
      const fetchedAt = new Date();
      await prisma.$transaction(async (tx) => {
        for (const row of rows) {
          const values = {
            impressions: metricCount(row.metrics, "IMPRESSION"), saves: metricCount(row.metrics, "SAVE"),
            pinClicks: metricCount(row.metrics, "PIN_CLICK"), outboundClicks: metricCount(row.metrics, "OUTBOUND_CLICK"),
            dataStatus: row.data_status, fetchedAt,
          };
          await tx.growthPinterestPinMetricDaily.upsert({
            where: { pinId_metricDate: { pinId: pin.id, metricDate: new Date(`${row.date}T00:00:00.000Z`) } },
            create: { pinId: pin.id, metricDate: new Date(`${row.date}T00:00:00.000Z`), ...values }, update: values,
          });
        }
        await tx.growthPinterestPin.update({ where: { id: pin.id }, data: { lastAnalyticsSyncAt: fetchedAt } });
        await tx.growthPinterestAnalyticsState.update({
          where: { accountId: params.accountId },
          data: {
            ...(isInitialBackfill ? { backfillPinsProcessed: { increment: 1 } } : {}),
            lastPinAnalyticsSyncAt: fetchedAt, lastSuccessfulSyncAt: fetchedAt,
            ...rateLimitData(lastRateLimit, fetchedAt),
          },
        });
      });
      processed += 1;
      if (lowRateLimit(lastRateLimit)) break;
    }
    const remaining = await prisma.growthPinterestPin.count({
      where: { accountId: params.accountId, isActive: true, ...analyticsDue },
    });
    if (remaining > 0) {
      await enqueueGrowthJob({
        type: GrowthJobType.PINTEREST_PIN_ANALYTICS_SYNC,
        idempotencyKey: continuationKey([params.accountId, params.runStartedAt, "pins", String(params.batch + 1)]),
        payload: { accountId: params.accountId, startDate: params.startDate, endDate: params.endDate, runStartedAt: params.runStartedAt, batch: params.batch + 1 },
      });
    } else {
      const completedAt = new Date();
      const completedState = await prisma.growthPinterestAnalyticsState.findUniqueOrThrow({ where: { accountId: params.accountId } });
      const allComponentsCurrent = Boolean(
        completedState.lastInventorySyncAt && completedState.lastInventorySyncAt >= cutoff &&
        completedState.lastAccountAnalyticsSyncAt && completedState.lastAccountAnalyticsSyncAt >= cutoff,
      );
      await prisma.growthPinterestAnalyticsState.update({
        where: { accountId: params.accountId },
        data: {
          status: allComponentsCurrent ? GrowthPinterestAnalyticsStatus.FRESH : GrowthPinterestAnalyticsStatus.PARTIAL,
          ...(allComponentsCurrent ? { backfillCompletedAt: completedAt, lastError: null } : {}),
          lastSuccessfulSyncAt: completedAt,
        },
      });
    }
    return { processed, remaining, complete: remaining === 0 };
  } catch (error) {
    await markAnalyticsFailure(params.accountId, error, GrowthPinterestAnalyticsStatus.PARTIAL);
    throw error;
  }
}

async function markAnalyticsFailure(
  accountId: string,
  error: unknown,
  status: GrowthPinterestAnalyticsStatus = GrowthPinterestAnalyticsStatus.FAILED,
) {
  const message = toSafeGrowthError(error);
  await prisma.growthPinterestAnalyticsState.upsert({
    where: { accountId },
    create: { accountId, status, lastAttemptAt: new Date(), lastError: message },
    update: { status, lastAttemptAt: new Date(), lastError: message },
  });
  await recordGrowthActivity({
    actorKind: GrowthActivityActorKind.WORKER, entityType: "GrowthPinterestAccount", entityId: accountId,
    action: "PINTEREST_ANALYTICS_SYNC_FAILED", summary: { error: message },
  });
}
