import { createHash } from "node:crypto";

import {
  GrowthActivityActorKind,
  GrowthJobType,
  GrowthPinterestAnalyticsRecoveryStatus,
  GrowthPinterestAnalyticsRecoveryTaskStatus,
  Prisma,
} from "@prisma/client";

import { recordGrowthActivity } from "@/lib/growth/activity";
import {
  NonRetryableGrowthJobError,
  RetryableGrowthJobError,
} from "@/lib/growth/errors";
import { enqueueGrowthJob } from "@/lib/growth/jobs";
import {
  analyticsDateRange,
  parseUtcDateOnly,
  utcDateOnly,
} from "@/lib/growth/pinterest/analytics-contract";
import {
  pinterestRateLimitData,
  upsertPinterestPinMetricRows,
} from "@/lib/growth/pinterest/analytics";
import {
  getPinterestPinAnalytics,
  getPinterestUserAccount,
  type PinterestRateLimitMetadata,
} from "@/lib/growth/pinterest/api";
import { prisma } from "@/lib/prisma";

export const PINTEREST_RECOVERY_MAX_PINS = 500;
export const PINTEREST_RECOVERY_MAX_TASKS = 2_000;
export const PINTEREST_RECOVERY_REQUESTS_PER_EXECUTION = 8;
export const PINTEREST_RECOVERY_RATE_LIMIT_RESERVE = 5;
export const PINTEREST_RECOVERY_RATE_LIMIT_MAX_AGE_MS = 15 * 60_000;
const PINTEREST_RECOVERY_MAX_QUOTA_PROBES_PER_EXECUTION = 1;
const PINTEREST_RECOVERY_RETRY_PROBE_DELAY_MS = 10_000;

export function canProbePinterestRecoveryQuota(reason: string, probesUsed: number) {
  return (
    probesUsed < PINTEREST_RECOVERY_MAX_QUOTA_PROBES_PER_EXECUTION &&
    (reason === "RATE_LIMIT_RESET_EXPIRED" ||
      reason === "RATE_LIMIT_METADATA_STALE")
  );
}

const DAY_MS = 86_400_000;
const MAX_RATE_LIMIT_WINDOW_MS = DAY_MS;

export type PinterestGapMetric = {
  metricDate: Date;
  dataStatus: string;
  fetchedAt?: Date;
};

export type PinterestGapPin = {
  id: string;
  pinterestPinId: string;
  publishedAt: Date | null;
  dailyMetrics: PinterestGapMetric[];
};

export type PinterestRecoveryTaskPlan = {
  pinId: string;
  pinterestPinId: string;
  startDate: string;
  endDate: string;
  missingDates: string[];
  processingDates: string[];
};

function nextUtcDate(date: string) {
  return utcDateOnly(new Date(parseUtcDateOnly(date).getTime() + DAY_MS));
}

export function defaultPinterestRecoveryRange(now = new Date()) {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - DAY_MS);
  const start = new Date(end.getTime() - 89 * DAY_MS);
  return { startDate: utcDateOnly(start), endDate: utcDateOnly(end) };
}

export function pinterestRecoveryDateRange(input: {
  startDate: string;
  endDate: string;
  now?: Date;
}) {
  const range = analyticsDateRange(input);
  const now = input.now || new Date();
  const latestCompletedDate = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - DAY_MS,
  );
  if (range.end > latestCompletedDate) {
    throw new Error("Pinterest analytics recovery may include only completed UTC dates.");
  }
  return range;
}

export function detectPinterestAnalyticsGaps(params: {
  pins: readonly PinterestGapPin[];
  startDate: string;
  endDate: string;
}) {
  const start = parseUtcDateOnly(params.startDate);
  const end = parseUtcDateOnly(params.endDate);
  const tasks: PinterestRecoveryTaskPlan[] = [];
  const dateCounts = new Map<
    string,
    { missingPins: number; processingPins: number }
  >();

  for (const pin of params.pins) {
    const pinStart = pin.publishedAt
      ? new Date(
          Math.max(
            start.getTime(),
            Date.UTC(
              pin.publishedAt.getUTCFullYear(),
              pin.publishedAt.getUTCMonth(),
              pin.publishedAt.getUTCDate(),
            ) + DAY_MS,
          ),
        )
      : start;
    if (pinStart > end) continue;
    const metrics = new Map(
      pin.dailyMetrics.map((row) => [utcDateOnly(row.metricDate), row]),
    );
    let open: PinterestRecoveryTaskPlan | null = null;
    for (
      let cursor = new Date(pinStart);
      cursor <= end;
      cursor = new Date(cursor.getTime() + DAY_MS)
    ) {
      const date = utcDateOnly(cursor);
      const status = metrics.get(date)?.dataStatus;
      const missing = status === undefined;
      const processing = status === "PROCESSING";
      if (!missing && !processing) {
        if (open) tasks.push(open);
        open = null;
        continue;
      }
      const counts = dateCounts.get(date) || {
        missingPins: 0,
        processingPins: 0,
      };
      if (missing) counts.missingPins += 1;
      if (processing) counts.processingPins += 1;
      dateCounts.set(date, counts);
      if (!open || nextUtcDate(open.endDate) !== date) {
        if (open) tasks.push(open);
        open = {
          pinId: pin.id,
          pinterestPinId: pin.pinterestPinId,
          startDate: date,
          endDate: date,
          missingDates: [],
          processingDates: [],
        };
      }
      open.endDate = date;
      if (missing) open.missingDates.push(date);
      if (processing) open.processingDates.push(date);
    }
    if (open) tasks.push(open);
  }

  return {
    tasks,
    dates: [...dateCounts.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([date, counts]) => ({ date, ...counts })),
  };
}

function planToken(params: {
  accountId: string;
  startDate: string;
  endDate: string;
  tasks: readonly PinterestRecoveryTaskPlan[];
  pins: readonly PinterestGapPin[];
}) {
  const fetchedByPinDate = new Map(
    params.pins.flatMap((pin) =>
      pin.dailyMetrics.map((metric) => [
        `${pin.pinterestPinId}:${utcDateOnly(metric.metricDate)}`,
        metric.fetchedAt?.toISOString() || "unversioned",
      ] as const),
    ),
  );
  const evidence = params.tasks.map((task) => ({
    ...task,
    observations: [...task.missingDates, ...task.processingDates].map(
      (date) =>
        `${date}:${fetchedByPinDate.get(`${task.pinterestPinId}:${date}`) || "missing"}`,
    ),
  }));
  return createHash("sha256")
    .update(
      JSON.stringify({
        accountId: params.accountId,
        startDate: params.startDate,
        endDate: params.endDate,
        evidence,
      }),
    )
    .digest("hex");
}

function numericRateLimit(value: string | null | undefined) {
  if (!value || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

type RecoveryRateLimitState = {
  lastRateLimitRemaining: string | null;
  lastRateLimitReset: string | null;
  rateLimitObservedAt: Date | null;
};

function rateLimitResetDate(value: string | null, observedAt: Date) {
  if (!value || !/^\d+$/.test(value)) return null;
  const secondsUntilReset = Number(value);
  if (
    !Number.isSafeInteger(secondsUntilReset) ||
    secondsUntilReset < 0 ||
    secondsUntilReset * 1000 > MAX_RATE_LIMIT_WINDOW_MS
  ) {
    return null;
  }
  const reset = new Date(observedAt.getTime() + secondsUntilReset * 1000);
  return Number.isFinite(reset.getTime()) ? reset : null;
}

export function assessPinterestRecoveryRateLimit(
  state: RecoveryRateLimitState | null,
  now = new Date(),
):
  | { status: "AVAILABLE"; remaining: number; resetAt: Date }
  | { status: "WAIT"; remaining: number; resetAt: Date }
  | { status: "UNRELIABLE"; reason: string } {
  if (!state?.rateLimitObservedAt)
    return { status: "UNRELIABLE", reason: "RATE_LIMIT_METADATA_MISSING" };
  const age = now.getTime() - state.rateLimitObservedAt.getTime();
  if (age < 0 || age > PINTEREST_RECOVERY_RATE_LIMIT_MAX_AGE_MS)
    return { status: "UNRELIABLE", reason: "RATE_LIMIT_METADATA_STALE" };
  const remaining = numericRateLimit(state.lastRateLimitRemaining);
  const resetAt = rateLimitResetDate(
    state.lastRateLimitReset,
    state.rateLimitObservedAt,
  );
  if (remaining === null || !resetAt) {
    return { status: "UNRELIABLE", reason: "RATE_LIMIT_METADATA_INVALID" };
  }
  if (resetAt <= now)
    return { status: "UNRELIABLE", reason: "RATE_LIMIT_RESET_EXPIRED" };
  return remaining <= PINTEREST_RECOVERY_RATE_LIMIT_RESERVE
    ? { status: "WAIT", remaining, resetAt }
    : { status: "AVAILABLE", remaining, resetAt };
}

type RecoveryPreviewClient = Pick<
  Prisma.TransactionClient,
  "growthPinterestPin" | "growthPinterestAnalyticsState"
>;

async function buildPinterestAnalyticsRecoveryPreview(
  client: RecoveryPreviewClient,
  params: {
    accountId: string;
    startDate?: string;
    endDate?: string;
    now?: Date;
  },
) {
  const defaults = defaultPinterestRecoveryRange(params.now);
  const range = pinterestRecoveryDateRange({
    startDate: params.startDate || defaults.startDate,
    endDate: params.endDate || defaults.endDate,
    now: params.now,
  });
  const [pinRows, state] = await Promise.all([
    client.growthPinterestPin.findMany({
      where: {
        accountId: params.accountId,
        isActive: true,
        analyticsEligible: true,
      },
      select: {
        id: true,
        pinterestPinId: true,
        publishedAt: true,
        dailyMetrics: {
          where: { metricDate: { gte: range.start, lte: range.end } },
          select: { metricDate: true, dataStatus: true, fetchedAt: true },
          orderBy: { metricDate: "asc" },
          take: 90,
        },
      },
      orderBy: { pinterestPinId: "asc" },
      take: PINTEREST_RECOVERY_MAX_PINS + 1,
    }),
    client.growthPinterestAnalyticsState.findUnique({
      where: { accountId: params.accountId },
      select: {
        lastRateLimitLimit: true,
        lastRateLimitRemaining: true,
        lastRateLimitReset: true,
        rateLimitObservedAt: true,
      },
    }),
  ]);
  const pinCapExhausted = pinRows.length > PINTEREST_RECOVERY_MAX_PINS;
  const pins = pinRows.slice(0, PINTEREST_RECOVERY_MAX_PINS);
  const detected = detectPinterestAnalyticsGaps({
    pins,
    startDate: range.startDate,
    endDate: range.endDate,
  });
  const taskCapExhausted = detected.tasks.length > PINTEREST_RECOVERY_MAX_TASKS;
  const tasks = detected.tasks.slice(0, PINTEREST_RECOVERY_MAX_TASKS);
  const remaining = numericRateLimit(state?.lastRateLimitRemaining);
  const affectedPinIds = [...new Set(tasks.map((task) => task.pinterestPinId))];
  const missingObservationCount = tasks.reduce(
    (sum, task) => sum + task.missingDates.length,
    0,
  );
  const processingObservationCount = tasks.reduce(
    (sum, task) => sum + task.processingDates.length,
    0,
  );
  return {
    readOnly: true,
    accountId: params.accountId,
    startDate: range.startDate,
    endDate: range.endDate,
    eligiblePinCount: pins.length,
    affectedPinCount: affectedPinIds.length,
    affectedPinterestPinIds: affectedPinIds,
    missingObservationCount,
    processingObservationCount,
    dates: detected.dates,
    estimatedApiRequests: tasks.length,
    perExecutionRequestBudget: PINTEREST_RECOVERY_REQUESTS_PER_EXECUTION,
    expectedRateLimitBudget: {
      observedLimit: numericRateLimit(state?.lastRateLimitLimit),
      observedRemaining: remaining,
      reserve: PINTEREST_RECOVERY_RATE_LIMIT_RESERVE,
      usableAtLastObservation:
        remaining === null
          ? null
          : Math.max(0, remaining - PINTEREST_RECOVERY_RATE_LIMIT_RESERVE),
      observedReset: state?.lastRateLimitReset || null,
      observedAt: state?.rateLimitObservedAt?.toISOString() || null,
    },
    pinCapExhausted,
    taskCapExhausted,
    capExhausted: pinCapExhausted || taskCapExhausted,
    previewToken: planToken({
      accountId: params.accountId,
      startDate: range.startDate,
      endDate: range.endDate,
      tasks,
      pins,
    }),
    tasks,
  };
}

export async function previewPinterestAnalyticsRecovery(params: {
  accountId: string;
  startDate?: string;
  endDate?: string;
  now?: Date;
}) {
  return buildPinterestAnalyticsRecoveryPreview(prisma, params);
}

export async function enqueuePinterestAnalyticsRecovery(params: {
  accountId: string;
  adminUserId: string;
  startDate: string;
  endDate: string;
  previewToken: string;
  now?: Date;
}) {
  const selected = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${params.accountId})) IS NULL AS "locked"`;
    const preview = await buildPinterestAnalyticsRecoveryPreview(tx, params);
    if (preview.previewToken !== params.previewToken) {
      throw new Error(
        "Pinterest analytics gaps changed after preview; review a new dry run.",
      );
    }
    if (preview.capExhausted) {
      throw new Error("Pinterest analytics recovery evidence exceeded its safety cap.");
    }
    if (!preview.tasks.length) {
      throw new Error("No recoverable Pinterest analytics gaps remain.");
    }
    const active = await tx.growthPinterestAnalyticsRecovery.findFirst({
      where: {
        accountId: params.accountId,
        status: {
          in: [
            GrowthPinterestAnalyticsRecoveryStatus.QUEUED,
            GrowthPinterestAnalyticsRecoveryStatus.RUNNING,
          ],
        },
      },
      orderBy: { createdAt: "asc" },
    });
    if (active) {
      if (active.previewToken !== preview.previewToken) {
        throw new Error("Another Pinterest analytics recovery is already active.");
      }
      return { recovery: active, created: false as const, preview };
    }
    const recovery = await tx.growthPinterestAnalyticsRecovery.create({
      data: {
        accountId: params.accountId,
        requestedByUserId: params.adminUserId,
        startDate: rangeDate(preview.startDate),
        endDate: rangeDate(preview.endDate),
        previewToken: preview.previewToken,
        affectedPinCount: preview.affectedPinCount,
        missingObservationCount: preview.missingObservationCount,
        processingObservationCount: preview.processingObservationCount,
        estimatedRequestCount: preview.estimatedApiRequests,
        requestBudget: preview.perExecutionRequestBudget,
        tasks: {
          create: preview.tasks.map((task) => ({
            pinId: task.pinId,
            pinterestPinId: task.pinterestPinId,
            startDate: rangeDate(task.startDate),
            endDate: rangeDate(task.endDate),
            missingDates: task.missingDates,
            processingDates: task.processingDates,
          })),
        },
      },
    });
    await recordGrowthActivity(
      {
        actorKind: GrowthActivityActorKind.USER,
        actorUserId: params.adminUserId,
        entityType: "GrowthPinterestAnalyticsRecovery",
        entityId: recovery.id,
        action: "PINTEREST_ANALYTICS_RECOVERY_QUEUED",
        toState: recovery.status,
        summary: {
          startDate: preview.startDate,
          endDate: preview.endDate,
          affectedPinCount: preview.affectedPinCount,
          estimatedApiRequests: preview.estimatedApiRequests,
          missingObservationCount: preview.missingObservationCount,
          processingObservationCount: preview.processingObservationCount,
        },
        correlationKey: `pinterest-recovery:${recovery.id}`,
      },
      tx,
    );
    return { recovery, created: true as const, preview };
  });

  const queued = await enqueueGrowthJob({
    type: GrowthJobType.PINTEREST_ANALYTICS_GAP_RECOVERY,
    idempotencyKey: `pinterest:analytics-recovery:${selected.recovery.id}`,
    payload: { recoveryId: selected.recovery.id, batch: 0 },
    maxAttempts: 5,
  });
  await prisma.growthPinterestAnalyticsRecovery.update({
    where: { id: selected.recovery.id },
    data: { jobId: queued.job.id },
  });
  return { ...selected, job: queued.job };
}

function rangeDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function responseRows(
  data: Record<
    string,
    {
      daily_metrics: Array<{
        date: string;
        data_status: string;
        metrics: Record<string, number>;
      }>;
    }
  >,
) {
  return data.all?.daily_metrics || [];
}

function isTerminalRecoveryStatus(
  status: GrowthPinterestAnalyticsRecoveryStatus,
) {
  return (
    status !== GrowthPinterestAnalyticsRecoveryStatus.QUEUED &&
    status !== GrowthPinterestAnalyticsRecoveryStatus.RUNNING
  );
}

async function enqueueRecoveryContinuation(params: {
  recoveryId: string;
  batch: number;
  runAfter: Date;
}) {
  return enqueueGrowthJob({
    type: GrowthJobType.PINTEREST_ANALYTICS_GAP_RECOVERY,
    idempotencyKey: `pinterest:analytics-recovery:${params.recoveryId}:${params.batch + 1}`,
    payload: { recoveryId: params.recoveryId, batch: params.batch + 1 },
    runAfter: params.runAfter,
    maxAttempts: 5,
  });
}

async function recoveryRequestGate(accountId: string, recoveryId: string) {
  const [current, state] = await Promise.all([
    prisma.growthPinterestAnalyticsRecovery.findUnique({
      where: { id: recoveryId },
      select: { status: true },
    }),
    prisma.growthPinterestAnalyticsState.findUnique({
      where: { accountId },
      select: {
        lastRateLimitRemaining: true,
        lastRateLimitReset: true,
        rateLimitObservedAt: true,
      },
    }),
  ]);
  if (!current || isTerminalRecoveryStatus(current.status)) {
    return { status: "TERMINAL" as const };
  }
  return assessPinterestRecoveryRateLimit(state);
}

export async function recoverPinterestAnalyticsGaps(params: {
  recoveryId: string;
  batch: number;
  fetchImpl?: typeof fetch;
}) {
  const recovery = await prisma.growthPinterestAnalyticsRecovery.findUnique({
    where: { id: params.recoveryId },
  });
  if (!recovery) {
    throw new NonRetryableGrowthJobError(
      "Pinterest analytics recovery does not exist.",
    );
  }
  if (isTerminalRecoveryStatus(recovery.status)) {
    return { recoveryId: recovery.id, complete: true, reused: true };
  }
  pinterestRecoveryDateRange({
    startDate: utcDateOnly(recovery.startDate),
    endDate: utcDateOnly(recovery.endDate),
  });
  await prisma.growthPinterestAnalyticsRecovery.updateMany({
    where: {
      id: recovery.id,
      status: GrowthPinterestAnalyticsRecoveryStatus.QUEUED,
    },
    data: {
      status: GrowthPinterestAnalyticsRecoveryStatus.RUNNING,
      startedAt: new Date(),
    },
  });
  const tasks = await prisma.growthPinterestAnalyticsRecoveryTask.findMany({
    where: {
      recoveryId: recovery.id,
      status: GrowthPinterestAnalyticsRecoveryTaskStatus.PENDING,
    },
    orderBy: [{ pinterestPinId: "asc" }, { startDate: "asc" }],
    take: Math.min(
      PINTEREST_RECOVERY_REQUESTS_PER_EXECUTION,
      Math.max(1, recovery.requestBudget),
    ),
  });
  let requests = 0;
  let blockedUntil: Date | null = null;
  let quotaProbes = 0;

  for (const task of tasks) {
    let gate = await recoveryRequestGate(recovery.accountId, recovery.id);
    if (gate.status === "TERMINAL") {
      return { recoveryId: recovery.id, complete: true, reused: true, requests };
    }
    if (
      gate.status === "UNRELIABLE" &&
      (gate.reason === "RATE_LIMIT_RESET_EXPIRED" ||
        gate.reason === "RATE_LIMIT_METADATA_STALE")
    ) {
      if (!canProbePinterestRecoveryQuota(gate.reason, quotaProbes)) {
        blockedUntil = new Date(Date.now() + PINTEREST_RECOVERY_RETRY_PROBE_DELAY_MS);
        break;
      }
      quotaProbes += 1;
      const probe = await getPinterestUserAccount(
        recovery.accountId,
        params.fetchImpl,
      );
      const observedAt = new Date();
      const rateData = pinterestRateLimitData(probe.rateLimit, observedAt);
      const verified = assessPinterestRecoveryRateLimit(rateData, observedAt);
      if (verified.status === "UNRELIABLE") {
        throw new RetryableGrowthJobError(
          `Pinterest read-only quota probe returned unreliable metadata (${verified.reason}).`,
          PINTEREST_RECOVERY_RATE_LIMIT_MAX_AGE_MS,
        );
      }
      await prisma.growthPinterestAnalyticsState.updateMany({
        where: { accountId: recovery.accountId },
        data: rateData,
      });
      gate = await recoveryRequestGate(recovery.accountId, recovery.id);
    }
    if (gate.status === "TERMINAL") {
      return { recoveryId: recovery.id, complete: true, reused: true, requests };
    }
    if (gate.status === "UNRELIABLE") {
      if (
        quotaProbes > 0 &&
        (gate.reason === "RATE_LIMIT_RESET_EXPIRED" ||
          gate.reason === "RATE_LIMIT_METADATA_STALE")
      ) {
        blockedUntil = new Date(Date.now() + PINTEREST_RECOVERY_RETRY_PROBE_DELAY_MS);
        break;
      }
      throw new RetryableGrowthJobError(
        `Pinterest analytics recovery requires reliable rate-limit metadata (${gate.reason}).`,
        PINTEREST_RECOVERY_RATE_LIMIT_MAX_AGE_MS,
      );
    }
    if (gate.status === "WAIT") {
      blockedUntil = new Date(gate.resetAt.getTime() + 1_000);
      break;
    }
    const pin = task.pinId
      ? await prisma.growthPinterestPin.findFirst({
          where: {
            id: task.pinId,
            accountId: recovery.accountId,
            pinterestPinId: task.pinterestPinId,
            isActive: true,
            analyticsEligible: true,
          },
          select: { id: true, pinterestPinId: true },
        })
      : null;
    if (!pin) {
      await prisma.growthPinterestAnalyticsRecoveryTask.update({
        where: { id: task.id },
        data: {
          status: GrowthPinterestAnalyticsRecoveryTaskStatus.COMPLETED,
          unresolvedDateCount:
            task.missingDates.length + task.processingDates.length,
          responseRowCount: 0,
          completedAt: new Date(),
        },
      });
      continue;
    }
    const startDate = utcDateOnly(task.startDate);
    const endDate = utcDateOnly(task.endDate);
    const response = await getPinterestPinAnalytics({
      accountId: recovery.accountId,
      pinterestPinId: pin.pinterestPinId,
      startDate,
      endDate,
      fetchImpl: params.fetchImpl,
    });
    const lastRateLimit: PinterestRateLimitMetadata = response.rateLimit;
    const rows = responseRows(response.data);
    if (rows.some((row) => row.date < startDate || row.date > endDate)) {
      throw new Error(
        "Pinterest returned a recovery metric outside the requested date range.",
      );
    }
    const requestedDates = new Set([
      ...task.missingDates,
      ...task.processingDates,
    ]);
    const readyDates = new Set(
      rows
        .filter(
          (row) => row.data_status === "READY" && requestedDates.has(row.date),
        )
        .map((row) => row.date),
    );
    const fetchedAt = new Date();
    const persisted = await prisma.$transaction(async (tx) => {
      const current = await tx.growthPinterestAnalyticsRecovery.findUnique({
        where: { id: recovery.id },
        select: { status: true },
      });
      if (
        !current ||
        current.status !== GrowthPinterestAnalyticsRecoveryStatus.RUNNING
      ) {
        return false;
      }
      await upsertPinterestPinMetricRows(tx, pin.id, rows, fetchedAt);
      await tx.growthPinterestAnalyticsRecoveryTask.update({
        where: { id: task.id },
        data: {
          status: GrowthPinterestAnalyticsRecoveryTaskStatus.COMPLETED,
          responseRowCount: rows.length,
          unresolvedDateCount: requestedDates.size - readyDates.size,
          completedAt: fetchedAt,
        },
      });
      await tx.growthPinterestAnalyticsRecovery.update({
        where: { id: recovery.id },
        data: { requestsCompleted: { increment: 1 } },
      });
      await tx.growthPinterestAnalyticsState.updateMany({
        where: { accountId: recovery.accountId },
        data: pinterestRateLimitData(lastRateLimit, fetchedAt),
      });
      return true;
    });
    if (!persisted) {
      return { recoveryId: recovery.id, complete: true, reused: true, requests };
    }
    requests += 1;
  }

  const pending = await prisma.growthPinterestAnalyticsRecoveryTask.count({
    where: {
      recoveryId: recovery.id,
      status: GrowthPinterestAnalyticsRecoveryTaskStatus.PENDING,
    },
  });
  if (pending > 0) {
    await enqueueRecoveryContinuation({
      recoveryId: recovery.id,
      batch: params.batch,
      runAfter: blockedUntil || new Date(),
    });
    return {
      recoveryId: recovery.id,
      complete: false,
      requests,
      pendingTasks: pending,
    };
  }

  const aggregate =
    await prisma.growthPinterestAnalyticsRecoveryTask.aggregate({
      where: { recoveryId: recovery.id },
      _sum: { unresolvedDateCount: true },
    });
  const unresolved = aggregate._sum.unresolvedDateCount || 0;
  const completedAt = new Date();
  const status = unresolved
    ? GrowthPinterestAnalyticsRecoveryStatus.COMPLETED_WITH_GAPS
    : GrowthPinterestAnalyticsRecoveryStatus.COMPLETED;
  const completed = await prisma.$transaction(async (tx) => {
    const updated = await tx.growthPinterestAnalyticsRecovery.updateMany({
      where: {
        id: recovery.id,
        status: GrowthPinterestAnalyticsRecoveryStatus.RUNNING,
      },
      data: { status, completedAt },
    });
    if (updated.count !== 1) return false;
    await recordGrowthActivity(
      {
        actorKind: GrowthActivityActorKind.WORKER,
        entityType: "GrowthPinterestAnalyticsRecovery",
        entityId: recovery.id,
        action: "PINTEREST_ANALYTICS_RECOVERY_COMPLETED",
        fromState: GrowthPinterestAnalyticsRecoveryStatus.RUNNING,
        toState: status,
        summary: { unresolvedDateCount: unresolved },
        correlationKey: `pinterest-recovery:${recovery.id}`,
      },
      tx,
    );
    return true;
  });
  if (!completed) {
    return { recoveryId: recovery.id, complete: true, reused: true, requests };
  }
  return {
    recoveryId: recovery.id,
    complete: true,
    requests,
    unresolvedDateCount: unresolved,
    status,
  };
}

export function assertRecoveryPreviewToken(value: string) {
  if (!/^[a-f0-9]{64}$/.test(value)) {
    throw new Error("Invalid Pinterest analytics recovery preview token.");
  }
  return value;
}
