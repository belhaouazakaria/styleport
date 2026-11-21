import { prisma } from "@/lib/prisma";
import { readDailyRotation } from "@/lib/growth/portfolio/daily-rotation-store";

const DAY = 86_400_000;
export function overviewWindow(now: Date) {
  const today = new Date(now);
  today.setUTCHours(0, 0, 0, 0);
  return {
    today,
    tomorrow: new Date(+today + DAY),
    start: new Date(+today - 14 * DAY),
    week: new Date(+today - 7 * DAY),
  };
}

export function publicationState(status: string, pinId: string | null) {
  if (["PUBLISHED", "RECONCILED"].includes(status) && pinId) return "Posted";
  if (["FAILED_TERMINAL", "FAILED", "REJECTED"].includes(status))
    return "Failed";
  if (status === "CANCELLED") return "Cancelled";
  if (
    ["AMBIGUOUS", "RECONCILING", "OUTCOME_UNKNOWN"].includes(status) ||
    ["PUBLISHED", "RECONCILED"].includes(status)
  )
    return "Checking outcome";
  if (status === "PUBLISHING" || status === "CLAIMED") return "Posting";
  if (status === "FAILED_RETRYABLE") return "Retry pending";
  return status === "SCHEDULED" || status === "APPROVED"
    ? "Scheduled"
    : "Needs attention";
}

type DailyMetric = {
  metricDate: Date;
  dataStatus: string;
  impressions: bigint;
  outboundClicks: bigint;
};
export function accountTrend(rows: DailyMetric[], today: Date) {
  const byDay = new Map(
    rows.map((row) => [row.metricDate.toISOString().slice(0, 10), row]),
  );
  const points = Array.from({ length: 14 }, (_, index) => {
    const day = new Date(+today - (14 - index) * DAY)
      .toISOString()
      .slice(0, 10);
    const row = byDay.get(day);
    return {
      day,
      impressions: row?.dataStatus === "READY" ? Number(row.impressions) : null,
      clicks: row?.dataStatus === "READY" ? Number(row.outboundClicks) : null,
    };
  });
  const previous = points.slice(0, 7),
    current = points.slice(7);
  const readyDays = current.filter((p) => p.clicks !== null).length;
  const complete = points.every(
    (p) => p.clicks !== null && p.impressions !== null,
  );
  const sum = (points: typeof current, key: "clicks" | "impressions") =>
    points.reduce((total, point) => total + (point[key] ?? 0), 0);
  return {
    points,
    readyDays,
    clicks: readyDays ? sum(current, "clicks") : null,
    impressions: readyDays ? sum(current, "impressions") : null,
    // Absolute deltas remain meaningful when the previous period was zero.
    clickChange: complete
      ? sum(current, "clicks") - sum(previous, "clicks")
      : null,
    impressionChange: complete
      ? sum(current, "impressions") - sum(previous, "impressions")
      : null,
  };
}

/** Database reads only. No sync, job creation, provider requests or consent. */
export async function getGrowthPublishingOverview(now = new Date()) {
  const { today, tomorrow, start, week } = overviewWindow(now);
  const scheduledAt = { gte: today, lt: tomorrow };
  const [
    rotation,
    policy,
    accounts,
    native,
    source,
    nativeAllocated,
    sourceAllocated,
    upcomingNative,
    upcomingSource,
    upcomingCount,
    upcomingSourceCount,
    reviewCount,
    readyCount,
    deliveryIssues,
    blocked,
    pinGroups,
    recoveryPolicy,
    recoveryCheck,
    repairs,
  ] = await Promise.all([
    readDailyRotation(today),
    prisma.growthViralProgramSettings.findUnique({
      where: { id: "global" },
      select: { mode: true, maxPinsPerDay: true },
    }),
    prisma.growthPinterestAccount.findMany({
      where: { apiEnvironment: "PRODUCTION" },
      orderBy: { publicationRole: "asc" },
      select: {
        id: true,
        username: true,
        connectionStatus: true,
        analyticsState: {
          select: {
            status: true,
            lastAccountAnalyticsSyncAt: true,
            lastPinAnalyticsSyncAt: true,
          },
        },
        dailyMetrics: {
          where: { metricDate: { gte: start, lt: today } },
          orderBy: { metricDate: "asc" },
          take: 14,
          select: {
            metricDate: true,
            dataStatus: true,
            impressions: true,
            outboundClicks: true,
          },
        },
      },
    }),
    prisma.growthPinPublication.findMany({
      where: { OR: [{ scheduledAt }, { publishedAt: scheduledAt }] },
      orderBy: { scheduledAt: "asc" },
      take: 201,
      select: {
        id: true,
        accountId: true,
        status: true,
        scheduledAt: true,
        publishedAt: true,
        pinterestPinId: true,
        candidate: { select: { title: true } },
      },
    }),
    prisma.growthViralPinTest.findMany({
      where: {
        channel: "SOURCE",
        OR: [{ scheduledAt }, { publishedAt: scheduledAt }],
      },
      orderBy: { scheduledAt: "asc" },
      take: 201,
      select: {
        id: true,
        accountId: true,
        status: true,
        scheduledAt: true,
        publishedAt: true,
        pinterestPinId: true,
        title: true,
      },
    }),
    prisma.growthPinPublication.count({
      where: {
        scheduledAt,
        status: { notIn: ["CANCELLED", "FAILED_TERMINAL"] },
      },
    }),
    prisma.growthViralPinTest.count({
      where: {
        scheduledAt,
        status: {
          in: ["APPROVED", "PUBLISHING", "OUTCOME_UNKNOWN", "PUBLISHED"],
        },
      },
    }),
    prisma.growthPinPublication.findMany({
      where: { scheduledAt: { gte: now }, status: "SCHEDULED" },
      orderBy: { scheduledAt: "asc" },
      take: 10,
      select: {
        id: true,
        accountId: true,
        scheduledAt: true,
        candidate: { select: { title: true } },
      },
    }),
    prisma.growthViralPinTest.findMany({
      where: {
        channel: "SOURCE",
        scheduledAt: { gte: now },
        status: "APPROVED",
      },
      orderBy: { scheduledAt: "asc" },
      take: 10,
      select: { id: true, accountId: true, scheduledAt: true, title: true },
    }),
    prisma.growthPinPublication.count({
      where: { scheduledAt: { gte: now }, status: "SCHEDULED" },
    }),
    prisma.growthViralPinTest.count({
      where: {
        channel: "SOURCE",
        scheduledAt: { gte: now },
        status: "APPROVED",
      },
    }),
    prisma.growthApprovalRequest.count({
      where: { status: "PENDING", expiresAt: { gt: now } },
    }),
    prisma.growthPinCandidate.count({
      where: { status: "READY", approvals: { none: { status: "APPROVED" } } },
    }),
    prisma.growthNotification.count({
      where: {
        status: { in: ["UNKNOWN", "DEAD"] },
        OR: [
          { lastErrorCode: null },
          { lastErrorCode: { not: "REVIEW_CLOSED_BEFORE_DELIVERY" } },
        ],
      },
    }),
    prisma.growthActivity.findMany({
      where: {
        action: "OWNER_REVIEW_PREPARATION_BLOCKED",
        createdAt: { gte: new Date(+now - DAY) },
      },
      select: { entityId: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 1,
    }),
    prisma.growthPinterestPinMetricDaily.groupBy({
      by: ["pinId"],
      where: {
        metricDate: { gte: week, lt: today },
        dataStatus: "READY",
        impressions: { not: null },
        outboundClicks: { not: null },
        pin: { isActive: true, account: { apiEnvironment: "PRODUCTION" } },
      },
      _sum: { impressions: true, outboundClicks: true, saves: true },
      _count: { _all: true },
      orderBy: [
        { _sum: { outboundClicks: "desc" } },
        { _sum: { impressions: "desc" } },
      ],
      take: 12,
    }),
    prisma.growthActivity.findFirst({
      where: {
        entityType: "GrowthSourceScheduleRecovery",
        entityId: "global",
        action: "SOURCE_SCHEDULE_RECOVERY_POLICY_UPDATED",
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { summary: true },
    }),
    prisma.growthActivity.findFirst({
      where: {
        entityType: "GrowthSourceScheduleRecovery",
        entityId: "global",
        action: "SOURCE_SCHEDULE_RECOVERY_CHECKED",
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { summary: true, createdAt: true },
    }),
    prisma.growthActivity.findMany({
      where: { action: "SOURCE_SCHEDULE_REPAIRED", createdAt: { gte: today } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { entityId: true, summary: true, createdAt: true },
      take: 100,
    }),
  ]);
  const pinIds = pinGroups.map((row) => row.pinId);
  const [pins, previous] = pinIds.length
    ? await Promise.all([
        prisma.growthPinterestPin.findMany({
          where: { id: { in: pinIds } },
          select: {
            id: true,
            title: true,
            pinterestPinId: true,
            accountId: true,
            lastAnalyticsSyncAt: true,
          },
        }),
        prisma.growthPinterestPinMetricDaily.groupBy({
          by: ["pinId"],
          where: {
            pinId: { in: pinIds },
            metricDate: { gte: start, lt: week },
            dataStatus: "READY",
            impressions: { not: null },
            outboundClicks: { not: null },
          },
          _sum: { outboundClicks: true },
          _count: { _all: true },
        }),
      ])
    : [[], []];
  const byId = new Map(accounts.map((a) => [a.id, a.username]));
  const accountName = (id: string | null) =>
    id ? (byId.get(id) ?? "Unknown account") : "Unassigned";
  const repairById = new Map<
    string,
    {
      previousScheduledAt: string;
      scheduledAt: string;
      repairedAt: string;
      automatic: boolean;
      replaced: boolean;
    }
  >(
    [...repairs].reverse().flatMap((row) => {
      const summary = row.summary as {
        originalId?: string;
        previousScheduledAt?: string;
        scheduledAt?: string;
        automatic?: boolean;
      } | null;
      if (
        !summary?.originalId ||
        !summary.previousScheduledAt ||
        !summary.scheduledAt ||
        !Number.isFinite(Date.parse(summary.previousScheduledAt)) ||
        !Number.isFinite(Date.parse(summary.scheduledAt))
      )
        return [];
      const repair = {
        previousScheduledAt: summary.previousScheduledAt,
        scheduledAt: summary.scheduledAt,
        repairedAt: row.createdAt.toISOString(),
        automatic: summary.automatic === true,
      };
      return [
        [row.entityId, { ...repair, replaced: false }],
        [summary.originalId, { ...repair, replaced: true }],
      ] as const;
    }),
  );
  const schedule = [
    ...native.map((p) => ({
      ...p,
      title: p.candidate.title,
      channel: "SayTwist",
    })),
    ...source.map((p) => ({
      ...p,
      title: p.title ?? "Untitled source Pin",
      channel: "Anything Translate",
    })),
  ]
    .sort(
      (a, b) =>
        +(a.scheduledAt ?? a.publishedAt!) - +(b.scheduledAt ?? b.publishedAt!),
    )
    .map((p) => ({
      id: p.id,
      title: p.title,
      accountId: p.accountId,
      account: accountName(p.accountId),
      channel: p.channel,
      recovery: repairById.get(p.id) ?? null,
      scheduledAt: p.scheduledAt?.toISOString() ?? null,
      publishedAt: p.publishedAt?.toISOString() ?? null,
      state: publicationState(p.status, p.pinterestPinId),
      overdue:
        ["APPROVED", "SCHEDULED"].includes(p.status) &&
        !!p.scheduledAt &&
        +p.scheduledAt < +now,
      pinUrl:
        p.pinterestPinId && /^\d+$/.test(p.pinterestPinId)
          ? "https://www.pinterest.com/pin/" + p.pinterestPinId + "/"
          : null,
    }));
  const active = policy?.mode === "ACTIVE";
  const cap = Math.min(5, policy?.maxPinsPerDay ?? 5, rotation.targetPins || 5);
  return {
    day: today.toISOString().slice(0, 10),
    generatedAt: now.toISOString(),
    recovery: {
      enabled:
        (recoveryPolicy?.summary as { enabled?: boolean } | null)?.enabled ===
        true,
      checkedAt: recoveryCheck?.createdAt.toISOString() ?? null,
      checkOverdue:
        !!recoveryCheck && +recoveryCheck.createdAt < +now - 10 * 60_000,
      status:
        (recoveryCheck?.summary as { status?: string } | null)?.status ?? null,
      repairedToday: repairs.length,
    },
    rotationAccount: accountName(rotation.accountId),
    rotationAccountId: rotation.accountId,
    rotationActive: active,
    rotationStatus: rotation.status,
    cap,
    nativeCap: active ? rotation.original : cap,
    sourceCap: active ? rotation.source : cap,
    nativeAllocated,
    sourceAllocated,
    schedule,
    scheduleTruncated: native.length > 200 || source.length > 200,
    pendingReviews: reviewCount,
    readyCreatives: readyCount,
    deliveryIssues,
    lastBlockedAt: blocked[0]?.createdAt.toISOString() ?? null,
    scheduledCount: upcomingCount + upcomingSourceCount,
    upcoming: [
      ...upcomingNative.map((p) => ({
        id: p.id,
        title: p.candidate.title,
        account: accountName(p.accountId),
        scheduledAt: p.scheduledAt.toISOString(),
      })),
      ...upcomingSource.map((p) => ({
        id: p.id,
        title: p.title ?? "Untitled source Pin",
        account: accountName(p.accountId),
        scheduledAt: p.scheduledAt!.toISOString(),
      })),
    ]
      .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))
      .slice(0, 10),
    accounts: accounts.map((a) => ({
      id: a.id,
      username: a.username,
      connection: a.connectionStatus,
      analyticsStatus: a.analyticsState?.status ?? "NEVER_SYNCED",
      lastAccountSync:
        a.analyticsState?.lastAccountAnalyticsSyncAt?.toISOString() ?? null,
      lastPinSync:
        a.analyticsState?.lastPinAnalyticsSyncAt?.toISOString() ?? null,
      ...accountTrend(a.dailyMetrics, today),
    })),
    trending: pinGroups.flatMap((group) => {
      const pin = pins.find((p) => p.id === group.pinId);
      if (!pin) return [];
      const prior = previous.find((p) => p.pinId === pin.id);
      const clicks = Number(group._sum.outboundClicks ?? 0),
        impressions = Number(group._sum.impressions ?? 0);
      return [
        {
          id: pin.id,
          title: pin.title ?? "Untitled Pin",
          account: accountName(pin.accountId),
          pinUrl: /^\d+$/.test(pin.pinterestPinId)
            ? "https://www.pinterest.com/pin/" + pin.pinterestPinId + "/"
            : null,
          clicks,
          impressions,
          saves: group._sum.saves === null ? null : Number(group._sum.saves),
          readyDays: group._count._all,
          clickChange:
            group._count._all === 7 && prior?._count._all === 7
              ? clicks - Number(prior._sum.outboundClicks ?? 0)
              : null,
        },
      ];
    }),
  };
}
export type GrowthPublishingOverview = Awaited<
  ReturnType<typeof getGrowthPublishingOverview>
>;
