import { prisma } from "@/lib/prisma";
import { wilsonBounds } from "./winners";

export function compareNativeCampaign(input: {
  sourceImpressions: number;
  sourceClicks: number;
  nativeImpressions: number;
  nativeClicks: number;
  complete: boolean;
}) {
  const values = [
    input.sourceImpressions,
    input.sourceClicks,
    input.nativeImpressions,
    input.nativeClicks,
  ];
  if (
    !input.complete ||
    !values.every((n) => Number.isSafeInteger(n) && n >= 0) ||
    input.sourceImpressions < 600 ||
    input.nativeImpressions < 600 ||
    input.sourceClicks > input.sourceImpressions ||
    input.nativeClicks > input.nativeImpressions
  )
    return { status: "INSUFFICIENT_EVIDENCE" };
  const source = wilsonBounds(input.sourceClicks, input.sourceImpressions),
    native = wilsonBounds(input.nativeClicks, input.nativeImpressions);
  return {
    status:
      native.lower > source.upper
        ? "NATIVE_OUTPERFORMS"
        : source.lower > native.upper
          ? "SOURCE_OUTPERFORMS"
          : "NO_CONFIDENT_DIFFERENCE",
    sourceOutboundRate: input.sourceClicks / input.sourceImpressions,
    nativeOutboundRate: input.nativeClicks / input.nativeImpressions,
    method: "NON_OVERLAPPING_95_PERCENT_WILSON_INTERVALS",
    qualifiedTraffic: "UNAVAILABLE_UNLESS_SEPARATELY_COLLECTED",
  };
}

/** Compare the SAME seven complete UTC dates, using daily official metrics.
 * Cumulative source summaries are never compared with younger native totals. */
export async function learnViralNativeOutcomes(now = new Date()) {
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const start = new Date(end.getTime() - 7 * 86400000);
  const conversions = await prisma.growthViralConversion.findMany({
    where: { status: "CAMPAIGN_PREPARED", campaignJobId: { not: null } },
    orderBy: { updatedAt: "asc" },
    take: 20,
  });
  let archived = 0;
  for (const conversion of conversions) {
    const [source, candidate] = await Promise.all([
      prisma.growthViralPinTest.findUnique({
        where: { id: conversion.winningPinTestId },
      }),
      prisma.growthPinCandidate.findUnique({
        where: { generationJobId: conversion.campaignJobId! },
        include: {
          publications: {
            where: { status: { in: ["PUBLISHED", "RECONCILED"] } },
            take: 1,
          },
        },
      }),
    ]);
    const native = candidate?.publications[0];
    if (
      !source?.pinterestPinId ||
      !native?.pinterestPinId ||
      !native.publishedAt ||
      native.publishedAt > start
    )
      continue;
    const pins = await prisma.growthPinterestPin.findMany({
      where: {
        pinterestPinId: { in: [source.pinterestPinId, native.pinterestPinId] },
      },
      select: {
        pinterestPinId: true,
        dailyMetrics: {
          where: { metricDate: { gte: start, lt: end } },
          select: { dataStatus: true, impressions: true, outboundClicks: true },
        },
      },
    });
    const sourceRows =
      pins.find((p) => p.pinterestPinId === source.pinterestPinId)
        ?.dailyMetrics ?? [];
    const nativeRows =
      pins.find((p) => p.pinterestPinId === native.pinterestPinId)
        ?.dailyMetrics ?? [];
    const complete =
      sourceRows.length === 7 &&
      nativeRows.length === 7 &&
      [...sourceRows, ...nativeRows].every(
        (r) =>
          r.dataStatus === "READY" &&
          r.impressions !== null &&
          r.outboundClicks !== null,
      );
    const totals = (rows: typeof sourceRows) =>
      rows.reduce(
        (a, r) => ({
          impressions: a.impressions + Number(r.impressions ?? 0),
          clicks: a.clicks + Number(r.outboundClicks ?? 0),
        }),
        { impressions: 0, clicks: 0 },
      );
    const s = totals(sourceRows),
      n = totals(nativeRows);
    const result = compareNativeCampaign({
      sourceImpressions: s.impressions,
      sourceClicks: s.clicks,
      nativeImpressions: n.impressions,
      nativeClicks: n.clicks,
      complete,
    });
    const key =
      "viral-native-learning:" +
      conversion.id +
      ":" +
      end.toISOString().slice(0, 10);
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
      if (await tx.growthActivity.findFirst({ where: { correlationKey: key } }))
        return;
      await tx.growthActivity.create({
        data: {
          actorKind: "SYSTEM",
          entityType: "GrowthViralConversion",
          entityId: conversion.id,
          action: "VIRAL_NATIVE_COMPARISON_ARCHIVED",
          correlationKey: key,
          summary: {
            ...result,
            windowStart: start.toISOString(),
            windowEndExclusive: end.toISOString(),
            sourcePinId: source.pinterestPinId,
            nativePinId: native.pinterestPinId,
          },
        },
      });
      archived++;
    });
  }
  return { archived };
}
