import { getAttributionCollectionStatus } from "@/lib/growth/attribution/config";
import { ATTRIBUTION_MODEL_VERSION } from "@/lib/growth/attribution/constants";
import { prisma } from "@/lib/prisma";

export type AttributionRangeDays = 7 | 30;

export async function getAttributionDashboard(rangeDays: AttributionRangeDays) {
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - rangeDays + 1);
  start.setUTCHours(0, 0, 0, 0);

  const [collection, totals, latestEvent, aggregateRows, eligiblePins] = await Promise.all([
    getAttributionCollectionStatus({ readSettingWhenServerDisabled: true }),
    prisma.growthAttributionDailyAggregate.aggregate({
      where: { metricDate: { gte: start }, modelVersion: ATTRIBUTION_MODEL_VERSION },
      _sum: { landingSessions: true, attributedTranslations: true, qualifiedConversions: true },
    }),
    prisma.growthAttributionEvent.findFirst({ orderBy: { occurredAt: "desc" }, select: { occurredAt: true } }),
    prisma.growthAttributionDailyAggregate.findMany({
      where: { metricDate: { gte: start }, modelVersion: ATTRIBUTION_MODEL_VERSION },
      orderBy: { qualifiedConversions: "desc" },
      take: 200,
      include: {
        attributionRef: { select: { id: true, publicRef: true, destinationPath: true, pinterestPin: { select: { pinterestPinId: true, title: true } } } },
        translator: { select: { name: true, slug: true } },
      },
    }),
    prisma.growthPinterestPin.findMany({
      where: { isActive: true, analyticsEligible: true, destinationUrl: { not: null } },
      orderBy: { lastSeenAt: "desc" },
      take: 50,
      select: {
        id: true,
        pinterestPinId: true,
        title: true,
        destinationUrl: true,
        attributionRefs: { take: 1, select: { publicRef: true, isActive: true } },
      },
    }),
  ]);

  const byRef = new Map<string, {
    publicRef: string;
    destinationPath: string;
    pinLabel: string;
    translatorLabel: string;
    landingSessions: number;
    attributedTranslations: number;
    qualifiedConversions: number;
  }>();
  for (const row of aggregateRows) {
    const key = `${row.attributionRefId}:${row.translatorId || "all"}`;
    const current = byRef.get(key) || {
      publicRef: row.attributionRef.publicRef,
      destinationPath: row.attributionRef.destinationPath,
      pinLabel: row.attributionRef.pinterestPin?.title || row.attributionRef.pinterestPin?.pinterestPinId || "Future Pin ref",
      translatorLabel: row.translator?.name || "Landing session",
      landingSessions: 0,
      attributedTranslations: 0,
      qualifiedConversions: 0,
    };
    current.landingSessions += row.landingSessions;
    current.attributedTranslations += row.attributedTranslations;
    current.qualifiedConversions += row.qualifiedConversions;
    byRef.set(key, current);
  }

  const landingSessions = totals._sum.landingSessions || 0;
  const qualifiedConversions = totals._sum.qualifiedConversions || 0;
  return {
    collection,
    modelVersion: ATTRIBUTION_MODEL_VERSION,
    rangeDays,
    latestIngestAt: latestEvent?.occurredAt || null,
    landingSessions,
    attributedTranslations: totals._sum.attributedTranslations || 0,
    qualifiedConversions,
    qualifiedConversionRate: landingSessions ? (qualifiedConversions / landingSessions) * 100 : 0,
    topDimensions: [...byRef.values()].sort((a, b) => b.qualifiedConversions - a.qualifiedConversions || b.attributedTranslations - a.attributedTranslations).slice(0, 20),
    eligiblePins,
  };
}
