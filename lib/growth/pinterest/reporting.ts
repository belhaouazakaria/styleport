import { ratePercent } from "@/lib/growth/pinterest/analytics-contract";
import { prisma } from "@/lib/prisma";

export type PinterestAnalyticsRangeDays = 7 | 30 | 90;

export async function getPinterestAnalyticsDashboard(params: {
  accountId?: string; rangeDays: PinterestAnalyticsRangeDays; search?: string;
}) {
  const accounts = await prisma.growthPinterestAccount.findMany({
    where: { connectionStatus: { not: "DISCONNECTED" } },
    select: { id: true, username: true, businessName: true, analyticsState: true },
    orderBy: { publicationRole: "asc" },
  });
  const selected = accounts.find((account) => account.id === params.accountId) || accounts[0] || null;
  if (!selected) return { accounts, selected: null, freshnessStatus: "NEVER_SYNCED", totals: emptyMetrics(), trend: [], pins: [], pinCount: 0, analyticsRelevantPinCount: 0, rangeStart: null, rangeEnd: null };

  const rangeEnd = new Date();
  rangeEnd.setUTCHours(0, 0, 0, 0);
  const rangeStart = new Date(rangeEnd);
  rangeStart.setUTCDate(rangeStart.getUTCDate() - (params.rangeDays - 1));
  const [accountAggregate, trend, pinGroups, pinCount, analyticsRelevantPinCount] = await Promise.all([
    prisma.growthPinterestAccountMetricDaily.aggregate({
      where: { accountId: selected.id, metricDate: { gte: rangeStart, lte: rangeEnd } },
      _sum: { impressions: true, saves: true, pinClicks: true, outboundClicks: true, engagements: true },
    }),
    prisma.growthPinterestAccountMetricDaily.findMany({
      where: { accountId: selected.id, metricDate: { gte: rangeStart, lte: rangeEnd } },
      select: { metricDate: true, impressions: true, saves: true, pinClicks: true, outboundClicks: true, dataStatus: true },
      orderBy: { metricDate: "asc" }, take: 90,
    }),
    prisma.growthPinterestPinMetricDaily.groupBy({
      by: ["pinId"],
      where: {
        metricDate: { gte: rangeStart, lte: rangeEnd },
        pin: {
          accountId: selected.id,
          isActive: true,
          analyticsEligible: true,
          ...(params.search ? { OR: [
            { title: { contains: params.search, mode: "insensitive" } },
            { pinterestPinId: { contains: params.search } },
          ] } : {}),
        },
      },
      _sum: { impressions: true, saves: true, pinClicks: true, outboundClicks: true },
      orderBy: { _sum: { outboundClicks: "desc" } }, take: 50,
    }),
    prisma.growthPinterestPin.count({ where: { accountId: selected.id, isActive: true } }),
    prisma.growthPinterestPin.count({ where: { accountId: selected.id, isActive: true, analyticsEligible: true } }),
  ]);
  const pinRows = pinGroups.length ? await prisma.growthPinterestPin.findMany({
    where: { id: { in: pinGroups.map((row) => row.pinId) } },
    select: {
      id: true, pinterestPinId: true, title: true, destinationUrl: true, previewImageUrl: true,
      publishedAt: true, lastAnalyticsSyncAt: true, board: { select: { name: true } },
    },
  }) : [];
  const pinById = new Map(pinRows.map((pin) => [pin.id, pin]));
  const pins = pinGroups.flatMap((group) => {
    const pin = pinById.get(group.pinId);
    if (!pin) return [];
    const metrics = normalizedMetrics(group._sum);
    return [{ ...pin, ...metrics, outboundClickRate: ratePercent(metrics.outboundClicks, metrics.impressions) }];
  });
  return {
    accounts, selected, pinCount, analyticsRelevantPinCount, rangeStart, rangeEnd,
    freshnessStatus: effectiveStatus(selected.analyticsState, analyticsRelevantPinCount),
    totals: normalizedMetrics(accountAggregate._sum),
    trend: trend.map((row) => ({ ...row, date: row.metricDate.toISOString().slice(0, 10) })),
    pins,
  };
}

function emptyMetrics() {
  return { impressions: BigInt(0), saves: BigInt(0), pinClicks: BigInt(0), outboundClicks: BigInt(0), engagements: BigInt(0) };
}

function normalizedMetrics(value: {
  impressions?: bigint | null; saves?: bigint | null; pinClicks?: bigint | null;
  outboundClicks?: bigint | null; engagements?: bigint | null;
}) {
  return {
    impressions: value.impressions || BigInt(0),
    saves: value.saves || BigInt(0),
    pinClicks: value.pinClicks || BigInt(0),
    outboundClicks: value.outboundClicks || BigInt(0),
    ...(Object.prototype.hasOwnProperty.call(value, "engagements") ? { engagements: value.engagements || BigInt(0) } : {}),
  };
}

export async function getPinterestAnalyticsOverview() {
  const [pinsInventoried, analyticsRelevantPins, states] = await Promise.all([
    prisma.growthPinterestPin.count({ where: { isActive: true } }),
    prisma.growthPinterestPin.count({ where: { isActive: true, analyticsEligible: true } }),
    prisma.growthPinterestAnalyticsState.findMany({
      select: { status: true, lastSuccessfulSyncAt: true,
        lastAccountAnalyticsSyncAt: true, lastInventorySyncAt: true,
        lastPinAnalyticsSyncAt: true, backfillCompletedAt: true,
        backfillPinsProcessed: true, backfillPinsTotal: true },
      orderBy: { lastSuccessfulSyncAt: "desc" },
    }),
  ]);
  return {
    pinsInventoried, analyticsRelevantPins,
    status: states.some((state) => state.status === "BACKFILLING") ? "BACKFILLING" : effectiveStatus(states[0]),
    lastSuccessfulSyncAt: states[0]?.lastSuccessfulSyncAt || null,
    backfillPinsProcessed: states.reduce((sum, state) => sum + state.backfillPinsProcessed, 0),
    backfillPinsTotal: states.reduce((sum, state) => sum + state.backfillPinsTotal, 0),
  };
}

type FreshnessState = {
  status: string;
  lastSuccessfulSyncAt: Date | null;
  lastAccountAnalyticsSyncAt?: Date | null;
  lastInventorySyncAt?: Date | null;
  lastPinAnalyticsSyncAt?: Date | null;
  backfillCompletedAt?: Date | null;
  backfillPinsProcessed?: number;
  backfillPinsTotal?: number;
};
const ACCOUNT_MAX_AGE_MS = 36 * 60 * 60_000;
const INVENTORY_MAX_AGE_MS = 24 * 60 * 60_000;
const PIN_MAX_AGE_MS = 36 * 60 * 60_000;

/** Do not let account-only analytics updates masquerade as fresh inventory
 * or fresh detailed Pin metrics. This is display-only; no job/state writes.
 */
export function effectiveStatus(
  state: FreshnessState | null | undefined,
  eligiblePinCount?: number,
  now = new Date(),
) {
  if (!state) return "NEVER_SYNCED";
  if (state.status !== "FRESH") return state.status;
  const current = now.getTime();
  const old = (value: Date | null | undefined, maxAge: number) =>
    !(value instanceof Date) || !Number.isFinite(value.getTime()) ||
    value.getTime() > current || current - value.getTime() > maxAge;
  const expectedPins = eligiblePinCount ?? state.backfillPinsTotal ?? 0;
  const progressIncomplete = !Number.isSafeInteger(expectedPins) ||
    expectedPins < 0 || (state.backfillPinsProcessed ?? -1) < expectedPins;
  if (old(state.lastSuccessfulSyncAt, ACCOUNT_MAX_AGE_MS) ||
      old(state.lastAccountAnalyticsSyncAt, ACCOUNT_MAX_AGE_MS) ||
      old(state.lastInventorySyncAt, INVENTORY_MAX_AGE_MS) ||
      (expectedPins > 0 && old(state.lastPinAnalyticsSyncAt, PIN_MAX_AGE_MS)) ||
      !state.backfillCompletedAt || progressIncomplete) {
    return "STALE";
  }
  return "FRESH";
}
