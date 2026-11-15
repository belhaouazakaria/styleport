import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  enqueuePinterestAnalyticsRecovery,
  previewPinterestAnalyticsRecovery,
} from "./analytics-recovery";

/** Coverage derives from persisted official observations. No metric is invented
 * for missing/PROCESSING days or for disconnected GA4/Search Console sources. */
export async function refreshGrowthAnalyticsCoverage(
  now = new Date(),
  automaticBackfill = false,
) {
  const accounts = await prisma.growthPinterestAccount.findMany({
    where: { apiEnvironment: "PRODUCTION" },
    select: { id: true, connectionStatus: true, grantedScopes: true },
    orderBy: { id: "asc" },
    take: 3,
  });
  let queued = 0;
  for (const account of accounts) {
    try {
      const preview = await previewPinterestAnalyticsRecovery({
        accountId: account.id,
        now,
      });
      const active = await prisma.growthPinterestAnalyticsRecovery.findFirst({
        where: { accountId: account.id, status: { in: ["QUEUED", "RUNNING"] } },
        orderBy: { createdAt: "asc" },
      });
      const state = await prisma.growthPinterestAnalyticsState.findUnique({
        where: { accountId: account.id },
      });
      const flags = [
        ...(preview.capExhausted ? ["EVIDENCE_CAP_REACHED"] : []),
        ...(account.connectionStatus !== "CONNECTED"
          ? ["OAUTH_NOT_CONNECTED"]
          : []),
        ...(preview.processingObservationCount ? ["PROVIDER_PROCESSING"] : []),
        "HISTORY_BEYOND_90_DAYS_UNAVAILABLE",
      ];
      let recoveryId = active?.id ?? null;
      if (
        automaticBackfill &&
        account.connectionStatus === "CONNECTED" &&
        account.grantedScopes.includes("pins:read") &&
        !active &&
        !preview.capExhausted &&
        preview.estimatedApiRequests > 0
      ) {
        const recovery = await enqueuePinterestAnalyticsRecovery({
          accountId: account.id,
          adminUserId: "system:growth-v2",
          systemInitiated: true,
          startDate: preview.startDate,
          endDate: preview.endDate,
          previewToken: preview.previewToken,
          now,
        });
        recoveryId = recovery.recovery.id;
        queued += recovery.created ? 1 : 0;
      }
      const status =
        account.connectionStatus !== "CONNECTED"
          ? "AUTHORIZATION_REQUIRED"
          : preview.capExhausted
            ? "PARTIAL"
            : recoveryId
              ? "BACKFILLING"
              : preview.estimatedApiRequests > 0
                ? "GAPS"
                : "COVERED";
      const data = {
        windowStart: new Date(preview.startDate + "T00:00:00Z"),
        windowEnd: new Date(preview.endDate + "T00:00:00Z"),
        supportedDays: 90,
        status,
        missingPeriods: preview.dates as Prisma.InputJsonValue,
        qualityFlags: flags,
        lastSuccessfulSyncAt: state?.lastSuccessfulSyncAt ?? null,
        lastErrorCode: null,
        rateLimit: preview.expectedRateLimitBudget as Prisma.InputJsonValue,
        recoveryId,
        observedAt: now,
      };
      await prisma.growthAnalyticsCoverage.upsert({
        where: {
          source_accountId_metricType: {
            source: "PINTEREST",
            accountId: account.id,
            metricType: "PIN_DAILY",
          },
        },
        update: data,
        create: {
          source: "PINTEREST",
          accountId: account.id,
          metricType: "PIN_DAILY",
          ...data,
        },
      });
    } catch {
      const end = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) -
          86400000,
      );
      const identity = {
        source: "PINTEREST",
        accountId: account.id,
        metricType: "PIN_DAILY",
      };
      await prisma.growthAnalyticsCoverage.upsert({
        where: { source_accountId_metricType: identity },
        update: {
          status: "ERROR",
          lastErrorCode: "COVERAGE_REFRESH_BLOCKED",
          qualityFlags: ["COVERAGE_UNAVAILABLE"],
          observedAt: now,
        },
        create: {
          ...identity,
          windowStart: new Date(end.getTime() - 89 * 86400000),
          windowEnd: end,
          supportedDays: 90,
          status: "ERROR",
          missingPeriods: [],
          qualityFlags: ["COVERAGE_UNAVAILABLE"],
          rateLimit: {},
          lastErrorCode: "COVERAGE_REFRESH_BLOCKED",
          observedAt: now,
        },
      });
      await prisma.growthActivity.create({
        data: {
          actorKind: "SYSTEM",
          entityType: "GrowthPinterestAccount",
          entityId: account.id,
          action: "ANALYTICS_COVERAGE_REFRESH_BLOCKED",
          summary: { retriableRead: true, noMetricsFabricated: true },
        },
      });
    }
  }
  return { accounts: accounts.length, backfillsQueued: queued };
}
