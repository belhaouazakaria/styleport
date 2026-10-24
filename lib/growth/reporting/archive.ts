import { GrowthContentVersionAction, GrowthIdeaVersionAction, Prisma } from "@prisma/client";
import { ATTRIBUTION_MODEL_VERSION } from "@/lib/growth/attribution/constants";
import { getAttributionCollectionStatus } from "@/lib/growth/attribution/config";
import { formatGrowthDailyDigest, type GrowthDigestData } from "@/lib/growth/reporting/digest";
import { prisma } from "@/lib/prisma";

export const GROWTH_REPORT_VERSION = "growth_daily_v1";

export function growthReportWindow(date: string, now = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Invalid UTC report date");
  const start = new Date(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(start.getTime()) || start.toISOString().slice(0, 10) !== date)
    throw new Error("Invalid UTC report date");
  const end = new Date(start.getTime() + 86_400_000);
  // Daily reports must contain a fully elapsed UTC day.
  if (end.getTime() > now.getTime()) throw new Error("The reporting day is not complete");
  return { start, end };
}

export async function archiveGrowthDailyReport(date: string) {
  const { start, end } = growthReportWindow(date);
  const reportId = `growth-${date.replaceAll("-", "")}`;
  const existing = await prisma.growthDailyReport.findUnique({ where: { reportDate: start } });
  if (existing) return { report: existing, reused: true };

  const [collection, accounts, totalMetrics, readyMetrics, metrics, attribution, pinCount, translatorCount, ideaCount] =
    await Promise.all([
      getAttributionCollectionStatus({ readSettingWhenServerDisabled: true }),
      prisma.growthPinterestAccount.count({ where: { connectionStatus: { not: "DISCONNECTED" } } }),
      prisma.growthPinterestAccountMetricDaily.count({ where: { metricDate: { gte: start, lt: end } } }),
      prisma.growthPinterestAccountMetricDaily.count({ where: { metricDate: { gte: start, lt: end }, dataStatus: "READY" } }),
      prisma.growthPinterestAccountMetricDaily.aggregate({
        where: { metricDate: { gte: start, lt: end }, dataStatus: "READY" },
        _sum: { outboundClicks: true },
      }),
      prisma.growthAttributionDailyAggregate.aggregate({
        where: { metricDate: { gte: start, lt: end }, modelVersion: ATTRIBUTION_MODEL_VERSION },
        _sum: { landingSessions: true, qualifiedConversions: true },
      }),
      prisma.growthPinPublication.count({
        where: { publishedAt: { gte: start, lt: end }, status: { in: ["PUBLISHED", "RECONCILING", "RECONCILED"] } },
      }),
      prisma.growthContentVersion.count({
        where: { createdAt: { gte: start, lt: end }, action: GrowthContentVersionAction.CREATE },
      }),
      prisma.growthIdeaVersion.count({
        where: { createdAt: { gte: start, lt: end }, action: GrowthIdeaVersionAction.CREATE },
      }),
    ]);

  const fullyReadyPinterest = accounts > 0 && totalMetrics >= accounts && totalMetrics === readyMetrics;
  const outbound = metrics._sum.outboundClicks;
  const outboundClicks = fullyReadyPinterest && outbound !== null && outbound <= BigInt(Number.MAX_SAFE_INTEGER)
    ? Number(outbound) : null;
  // No '0' for attribution while the collection gate is off or when
  // there is no evidence row for this date.
  const attributionAvailable = collection.enabled &&
    await prisma.growthAttributionDailyAggregate.count({
      where: { metricDate: { gte: start, lt: end }, modelVersion: ATTRIBUTION_MODEL_VERSION },
    }) > 0;

  const warnings = [
    ...(!fullyReadyPinterest ? ["Pinterest daily analytics unavailable or partial"] : []),
    ...(!attributionAvailable ? ["Attribution evidence unavailable"] : []),
    "Growth AI actual spending not fully priced",
  ];
  const digest: GrowthDigestData = {
    date,
    pinterestLandingSessions: attributionAvailable ? (attribution._sum.landingSessions ?? 0) : null,
    qualifiedConversions: attributionAvailable ? (attribution._sum.qualifiedConversions ?? 0) : null,
    outboundClicks,
    pinsPublished: pinCount,
    newTranslators: translatorCount,
    newIdeas: ideaCount,
    aiSpendUsd: null,
    breakout: null,
    warnings,
    nextAction: null,
    reportId,
  };
  const body = formatGrowthDailyDigest(digest);
  const snapshot = { ...digest, version: GROWTH_REPORT_VERSION, source: "LOCAL_DATABASE",
    pinterestReady: fullyReadyPinterest, attributionAvailable } satisfies Prisma.JsonObject;

  // An immutable, one-day unique upsert preserves the first successful snapshot
  // even if another worker reads newer analytics during report generation.
  const report = await prisma.growthDailyReport.upsert({
    where: { reportDate: start },
    create: { id: reportId, reportDate: start, version: GROWTH_REPORT_VERSION, snapshot, digestText: body },
    update: {},
  });
  return { report, reused: report.digestText !== body };
}
