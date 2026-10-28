import { GrowthContentVersionAction, GrowthIdeaVersionAction, Prisma } from "@prisma/client";
import { ATTRIBUTION_MODEL_VERSION } from "@/lib/growth/attribution/constants";
import { getAttributionCollectionStatus } from "@/lib/growth/attribution/config";
import { formatGrowthDailyDigest, type GrowthDigestData } from "@/lib/growth/reporting/digest";
import { deriveDailyGrowthInsights } from "@/lib/growth/reporting/insights";
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

  const [collection, accounts, totalMetrics, readyMetrics, metrics, attribution, pinCount, translatorCount, ideaCount, reservations] =
    await Promise.all([
      getAttributionCollectionStatus({ readSettingWhenServerDisabled: true }),
      prisma.growthPinterestAccount.count({ where: { connectionStatus: { not: "DISCONNECTED" } } }),
      prisma.growthPinterestAccountMetricDaily.count({ where: { metricDate: { gte: start, lt: end }, account: { connectionStatus: { not: "DISCONNECTED" } } } }),
      prisma.growthPinterestAccountMetricDaily.count({ where: { metricDate: { gte: start, lt: end }, dataStatus: "READY", account: { connectionStatus: { not: "DISCONNECTED" } } } }),
      prisma.growthPinterestAccountMetricDaily.aggregate({
        where: { metricDate: { gte: start, lt: end }, dataStatus: "READY", account: { connectionStatus: { not: "DISCONNECTED" } } },
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
      // Pessimistic reservation ceilings are not provider-billed AI spend.
      prisma.growthAiBudgetReservation.aggregate({
        where: { createdAt: { gte: start, lt: end } },
        _sum: { reservedCents: true },
      }),
    ]);

  const fullyReadyPinterest = accounts > 0 && totalMetrics === accounts && readyMetrics === accounts;
  const outbound = metrics._sum.outboundClicks;
  const outboundClicks = fullyReadyPinterest && outbound !== null && outbound >= BigInt(0) && outbound <= BigInt(Number.MAX_SAFE_INTEGER)
    ? Number(outbound) : null;
  // No '0' for attribution while the collection gate is off or when
  // there is no evidence row for this date.
  const attributionAvailable = collection.enabled &&
    await prisma.growthAttributionDailyAggregate.count({
      where: { metricDate: { gte: start, lt: end }, modelVersion: ATTRIBUTION_MODEL_VERSION },
    }) > 0;

  // A Pin is a defensible daily "top measured" observation only with full
  // READY, non-null coverage of every active analytics-eligible Pin. Partial
  // rank lists must not be promoted to a breakout or recommendation.
  let topPin: { title: string; outboundClicks: number } | null = null;
  if (fullyReadyPinterest) {
    const eligiblePins = await prisma.growthPinterestPin.count({
      where: { isActive: true, analyticsEligible: true, account: { connectionStatus: { not: "DISCONNECTED" } } },
    });
    if (eligiblePins > 0) {
      const completeRows = await prisma.growthPinterestPinMetricDaily.count({
        where: {
          metricDate: { gte: start, lt: end },
          dataStatus: "READY",
          outboundClicks: { not: null },
          pin: { isActive: true, analyticsEligible: true, account: { connectionStatus: { not: "DISCONNECTED" } } },
        },
      });
      if (completeRows === eligiblePins) {
        const top = await prisma.growthPinterestPinMetricDaily.findFirst({
          where: {
            metricDate: { gte: start, lt: end },
            dataStatus: "READY",
            outboundClicks: { gt: BigInt(0) },
            pin: { isActive: true, analyticsEligible: true, account: { connectionStatus: { not: "DISCONNECTED" } } },
          },
          orderBy: [{ outboundClicks: "desc" }, { pinId: "asc" }],
          select: { outboundClicks: true, pin: { select: { title: true, pinterestPinId: true } } },
        });
        if (top?.outboundClicks != null &&
            top.outboundClicks <= BigInt(Number.MAX_SAFE_INTEGER)) {
          topPin = {
            title: top.pin.title?.trim() || "Pin " + top.pin.pinterestPinId.slice(0, 12),
            outboundClicks: Number(top.outboundClicks),
          };
        }
      }
    }
  }
  const insights = deriveDailyGrowthInsights({
    pinterestComplete: fullyReadyPinterest,
    attributionComplete: attributionAvailable,
    topPin,
  });
  const aiReservedCents = reservations._sum.reservedCents;
  const safeReservedCents = aiReservedCents !== null && Number.isSafeInteger(aiReservedCents) && aiReservedCents >= 0
    ? aiReservedCents : null;

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
    // Provider-verified Growth billing settlements do not exist yet. Even a
    // zero reservation balance does not establish zero real-world expenditure.
    aiSpendUsd: null,
    aiReservedCents: safeReservedCents,
    breakout: insights.breakout,
    warnings,
    nextAction: insights.nextAction,
    reportId,
  };
  const body = formatGrowthDailyDigest(digest);
  const snapshot = { ...digest, version: GROWTH_REPORT_VERSION, source: "LOCAL_DATABASE",
    pinterestReady: fullyReadyPinterest, attributionAvailable } satisfies Prisma.JsonObject;

  // INSERT-only: a PostgreSQL BEFORE UPDATE/DELETE trigger protects the
  // snapshot. Prisma upsert's ON CONFLICT UPDATE can still fire that trigger,
  // even with update: {}, so a unique collision must instead read the winner.
  // There is never a second mutation to an archived report.
  try {
    const report = await prisma.growthDailyReport.create({
      data: { id: reportId, reportDate: start, version: GROWTH_REPORT_VERSION, snapshot, digestText: body },
    });
    return { report, reused: false };
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
      throw error;
    }
    const report = await prisma.growthDailyReport.findUniqueOrThrow({ where: { reportDate: start } });
    return { report, reused: true };
  }
}
