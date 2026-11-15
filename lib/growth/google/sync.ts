import { prisma } from "@/lib/prisma";
import {
  GoogleAnalyticsError,
  googleAnalyticsConfig,
  obtainGoogleAnalyticsToken,
  readGoogleDailyAnalytics,
  type GoogleSource,
} from "./provider";

/** Reads only. Initial backfill is a bounded 90-day report (at most 90 date
 * rows); later successful daily reads refresh seven provider-date labels.
 * No cross-provider attribution or UTC reinterpretation is performed. */
export async function synchronizeGoogleAnalytics(
  now = new Date(),
  env: Record<string, string | undefined> = process.env,
  fetcher: typeof fetch = fetch,
) {
  if (env.GROWTH_GOOGLE_ANALYTICS_ENABLED !== "true")
    return { status: "DISABLED", synchronized: 0 };
  const config = googleAnalyticsConfig(env);
  const targets: { source: GoogleSource; accountId: string }[] = [
    ...(config.propertyId
      ? [{ source: "GA4" as const, accountId: config.propertyId }]
      : []),
    ...(config.site
      ? [{ source: "SEARCH_CONSOLE" as const, accountId: config.site }]
      : []),
  ];
  let synchronized = 0;
  for (const target of targets) {
    const identity = { ...target, metricType: "PROVIDER_DAILY" };
    const ledger = await prisma.growthAnalyticsCoverage.findUnique({
      where: { source_accountId_metricType: identity },
    });
    const next = (ledger?.rateLimit as { retryAt?: string } | null)?.retryAt;
    if (next && new Date(next) > now) continue;
    if (
      ledger?.lastSuccessfulSyncAt?.toISOString().slice(0, 10) ===
      now.toISOString().slice(0, 10)
    )
      continue;
    const key =
      "google-analytics:" +
      target.source +
      ":" +
      target.accountId +
      ":" +
      now.toISOString().slice(0, 10);
    const reserved = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
      const attempts = await tx.growthActivity.findMany({
        where: {
          correlationKey: key,
          action: "GOOGLE_ANALYTICS_READ_RESERVED",
        },
        select: { createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 3,
      });
      if (
        attempts.length >= 3 ||
        (attempts[0] &&
          now.getTime() - attempts[0].createdAt.getTime() < 120000)
      )
        return false;
      await tx.growthActivity.create({
        data: {
          actorKind: "SYSTEM",
          entityType: "GrowthExternalAnalytics",
          entityId: target.source,
          action: "GOOGLE_ANALYTICS_READ_RESERVED",
          correlationKey: key,
          summary: {
            source: target.source,
            accountId: target.accountId,
            attempt: attempts.length + 1,
            readOnly: true,
          },
        },
      });
      return true;
    });
    if (!reserved) continue;
    // Three-day lag is conservative for both UTC and Pacific dates. Provider
    // date labels/time zone remain explicitly attached to every observation.
    const end = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) -
        3 * 86400000,
    );
    const oldest = new Date(end.getTime() - 89 * 86400000);
    const start = ledger?.lastSuccessfulSyncAt
      ? new Date(end.getTime() - 6 * 86400000)
      : oldest;
    try {
      const token = await obtainGoogleAnalyticsToken(
        config,
        target.source,
        fetcher,
        now,
      );
      const result = await readGoogleDailyAnalytics(
        target.source,
        target.accountId,
        start.toISOString().slice(0, 10),
        end.toISOString().slice(0, 10),
        token,
        fetcher,
      );
      await prisma.$transaction(async (tx) => {
        for (const row of result.rows)
          await tx.growthExternalAnalyticsDaily.upsert({
            where: {
              source_accountId_metricDate: {
                ...target,
                metricDate: new Date(row.date + "T00:00:00Z"),
              },
            },
            update: {
              metrics: row.metrics,
              providerTimeZone: result.providerTimeZone,
              qualityFlags: result.qualityFlags,
              fetchedAt: now,
            },
            create: {
              ...target,
              metricDate: new Date(row.date + "T00:00:00Z"),
              metrics: row.metrics,
              providerTimeZone: result.providerTimeZone,
              qualityFlags: result.qualityFlags,
              fetchedAt: now,
            },
          });
        const returnedDates = result.rows.map(
          (row) => new Date(row.date + "T00:00:00Z"),
        );
        await tx.growthExternalAnalyticsDaily.updateMany({
          where: {
            ...target,
            metricDate: {
              gte: start,
              lte: end,
              ...(returnedDates.length ? { notIn: returnedDates } : {}),
            },
          },
          data: {
            qualityFlags: ["PROVIDER_OMITTED_ON_REFRESH"],
            fetchedAt: now,
          },
        });
        const stored = await tx.growthExternalAnalyticsDaily.findMany({
          where: {
            ...target,
            metricDate: { gte: oldest, lte: end },
            NOT: { qualityFlags: { has: "PROVIDER_OMITTED_ON_REFRESH" } },
          },
          select: { metricDate: true },
          take: 90,
        });
        const dates = new Set(
          stored.map((r) => r.metricDate.toISOString().slice(0, 10)),
        );
        const missing = Array.from({ length: 90 }, (_, i) =>
          new Date(oldest.getTime() + i * 86400000).toISOString().slice(0, 10),
        ).filter((d) => !dates.has(d));
        const data = {
          windowStart: oldest,
          windowEnd: end,
          supportedDays: 90,
          status: missing.length ? "COVERED_WITH_OMISSIONS" : "COVERED",
          missingPeriods: missing,
          qualityFlags: [
            ...result.qualityFlags,
            "POLICY_BOUNDED_90_DAY_LOOKBACK",
          ],
          lastSuccessfulSyncAt: now,
          lastErrorCode: null,
          rateLimit: {},
          observedAt: now,
        };
        await tx.growthAnalyticsCoverage.upsert({
          where: { source_accountId_metricType: identity },
          update: data,
          create: { ...identity, ...data },
        });
      });
      synchronized++;
    } catch (e) {
      const error =
        e instanceof GoogleAnalyticsError
          ? e
          : new GoogleAnalyticsError("TRANSIENT");
      const data = {
        status:
          error.code === "AUTHORIZATION" ? "AUTHORIZATION_REQUIRED" : "ERROR",
        lastErrorCode: error.code,
        rateLimit: {
          retryAt: new Date(
            now.getTime() +
              (error.code === "AUTHORIZATION"
                ? 86400000
                : Math.max(300000, error.retryAfterMs)),
          ).toISOString(),
        },
        observedAt: now,
      };
      await prisma.growthAnalyticsCoverage.upsert({
        where: { source_accountId_metricType: identity },
        update: data,
        create: {
          ...identity,
          ...data,
          windowStart: oldest,
          windowEnd: end,
          supportedDays: 90,
          missingPeriods: [],
          qualityFlags: ["PROVIDER_DATA_UNAVAILABLE"],
        },
      });
      if (error.code === "AUTHORIZATION") {
        const dedupeKey =
          "google-authorization:" +
          target.source +
          ":" +
          target.accountId +
          ":" +
          now.toISOString().slice(0, 10);
        await prisma.growthNotification.upsert({
          where: { dedupeKey },
          update: {},
          create: {
            dedupeKey,
            payload: {
              content:
                "SayTwist " +
                target.source +
                " authorization needs owner attention. No data was invented. Review https://saytwist.com/admin/growth/intelligence",
              allowed_mentions: { parse: [] },
            },
          },
        });
      }
    }
  }
  return { status: "COMPLETE", synchronized };
}
