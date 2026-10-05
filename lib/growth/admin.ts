import { GrowthJobStatus } from "@prisma/client";

import { getGrowthSettings } from "@/lib/growth/settings";
import { getPinterestAnalyticsOverview } from "@/lib/growth/pinterest/reporting";
import { prisma } from "@/lib/prisma";

export async function getGrowthFoundationOverview() {
  const [settings, groupedJobs, oldestRunnableJob, recentActivity, worker, pinterestAnalytics] = await Promise.all([
    getGrowthSettings(),
    prisma.growthJob.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.growthJob.findFirst({
      where: { status: GrowthJobStatus.PENDING, runAfter: { lte: new Date() } },
      select: { id: true, type: true, runAfter: true },
      orderBy: [{ runAfter: "asc" }, { createdAt: "asc" }],
    }),
    prisma.growthActivity.findMany({
      take: 12,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        actorKind: true,
        entityType: true,
        entityId: true,
        action: true,
        fromState: true,
        toState: true,
        summary: true,
        createdAt: true,
      },
    }),
    prisma.growthWorkerHeartbeat.findFirst({ orderBy: { heartbeatAt: "desc" } }),
    getPinterestAnalyticsOverview(),
  ]);

  const counts = Object.fromEntries(groupedJobs.map((row) => [row.status, row._count._all]));
  return {
    settings,
    jobs: {
      queued: counts.PENDING || 0,
      claimed: counts.CLAIMED || 0,
      running: counts.RUNNING || 0,
      retryable: counts.FAILED_RETRYABLE || 0,
      terminalFailed: counts.FAILED_TERMINAL || 0,
      succeeded: counts.SUCCEEDED || 0,
      cancelled: counts.CANCELLED || 0,
      oldestRunnableJob,
    },
    recentActivity,
    worker,
    pinterestAnalytics,
  };
}
