import { prisma } from "@/lib/prisma";
import { getPinterestPinAnalytics } from "@/lib/growth/pinterest/api";
import { upsertPinterestPinMetricRows } from "@/lib/growth/pinterest/analytics";
import { metricCount } from "@/lib/growth/pinterest/analytics-contract";

/** One recent source experiment per invocation. Reuses the existing official
 * read transport and shared API quota. Explicit ownership replaces domain
 * eligibility only for these individually published, immutable experiments. */
export async function collectSourceExperimentAnalytics(
  now = new Date(),
  fetchImpl?: typeof fetch,
) {
  const tests = await prisma.growthViralPinTest.findMany({
    where: {
      channel: "SOURCE",
      status: { in: ["PUBLISHED", "TRACKED"] },
      pinterestPinId: { not: null },
      publishedAt: { lte: new Date(now.getTime() - 86400000) },
    },
    orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
    take: 100,
  });
  for (const test of tests) {
    // Attempt cursor, not metric freshness. Even invalid/reserved/failed reads
    // rotate behind untouched experiments; one bad old Pin cannot monopolize it.
    const advanced = await prisma.growthViralPinTest.updateMany({
      where: { id: test.id, updatedAt: test.updatedAt },
      data: { updatedAt: now },
    });
    if (!advanced.count || !test.pinterestPinId || !test.publishedAt) continue;
    const pin = await prisma.growthPinterestPin.findUnique({
      where: { pinterestPinId: test.pinterestPinId },
      include: {
        account: { select: { connectionStatus: true, apiEnvironment: true } },
      },
    });
    if (
      !test.accountId ||
      !pin?.isActive ||
      pin.accountId !== test.accountId ||
      pin.account.connectionStatus !== "CONNECTED" ||
      pin.account.apiEnvironment !== "PRODUCTION" ||
      pin.destinationUrl !== test.destinationUrl
    )
      continue;
    const end = new Date(now);
    end.setUTCHours(0, 0, 0, 0);
    end.setUTCDate(end.getUTCDate() - 1);
    const start = new Date(
      Math.max(test.publishedAt.getTime(), end.getTime() - 27 * 86400000),
    );
    start.setUTCHours(0, 0, 0, 0);
    const key =
      "source-analytics:" + test.id + ":" + now.toISOString().slice(0, 10);
    const admitted = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
      if (
        await tx.growthActivity.findFirst({
          where: { correlationKey: key, action: "SOURCE_ANALYTICS_RESERVED" },
        })
      )
        return false;
      await tx.growthActivity.create({
        data: {
          actorKind: "SYSTEM",
          entityType: "GrowthViralPinTest",
          entityId: test.id,
          correlationKey: key,
          action: "SOURCE_ANALYTICS_RESERVED",
          summary: { requests: 1 },
        },
      });
      return true;
    });
    if (!admitted) continue;
    const startDate = start.toISOString().slice(0, 10),
      endDate = end.toISOString().slice(0, 10);
    const response = await getPinterestPinAnalytics({
      accountId: pin.accountId,
      pinterestPinId: test.pinterestPinId,
      startDate,
      endDate,
      fetchImpl,
    });
    const rows = Object.values(response.data).flatMap(
      (block) => block.daily_metrics,
    );
    if (
      rows.some((row) => row.date < startDate || row.date > endDate) ||
      new Set(rows.map((r) => r.date)).size !== rows.length
    )
      throw Error("SOURCE_ANALYTICS_RANGE_INVALID");
    const ready = rows.filter((row) => row.data_status === "READY");
    const expectedDays =
      Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
    const complete = ready.length === expectedDays;
    const total = ready.reduce(
      (a, r) => ({
        impressions: a.impressions + metricCount(r.metrics, "IMPRESSION"),
        saves: a.saves + metricCount(r.metrics, "SAVE"),
        outbound: a.outbound + metricCount(r.metrics, "OUTBOUND_CLICK"),
      }),
      { impressions: BigInt(0), saves: BigInt(0), outbound: BigInt(0) },
    );
    await prisma.$transaction(async (tx) => {
      await upsertPinterestPinMetricRows(tx, pin.id, rows, now);
      await tx.growthPinterestPin.update({
        where: { id: pin.id },
        data: {
          summaryStartDate: start,
          summaryEndDate: end,
          summaryFetchedAt: now,
          summaryImpressions: complete ? total.impressions : null,
          summarySaves: complete ? total.saves : null,
          summaryOutboundClicks: complete ? total.outbound : null,
        },
      });
      await tx.growthViralPinTest.update({
        where: { id: test.id },
        data: { updatedAt: now },
      });
    });
    return { fetched: 1, complete };
  }
  return { fetched: 0 };
}
