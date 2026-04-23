import { TranslationStatus, UsageProtectionEventType, type UsageProtectionState } from "@prisma/client";
import type { Prisma } from "@prisma/client";

import {
  DEFAULT_GLOBAL_DAILY_TOKEN_CAP,
  DEFAULT_IP_LIMIT_PER_DAY,
  DEFAULT_IP_LIMIT_PER_HOUR,
  DEFAULT_IP_LIMIT_PER_MINUTE,
  USAGE_PROTECTION_STATE_ID,
} from "@/lib/constants";
import { sendEmergencyShutdownAlertEmail } from "@/lib/email-alerts";
import { getServerEnv } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import type { ApiErrorCode, UsageProtectionDashboardData, UsageProtectionSettingsInput } from "@/lib/types";
import { extractClientIp, hashIp } from "@/lib/utils";

type DbClient = Prisma.TransactionClient | typeof prisma;

const USAGE_STATE_CACHE_TTL_MS = 5_000;
const DAILY_TOKEN_USAGE_CACHE_TTL_MS = 5_000;

export type UsageBlockReason =
  | "IP_MINUTE_LIMIT"
  | "IP_HOUR_LIMIT"
  | "IP_DAY_LIMIT"
  | "EMERGENCY_SHUTDOWN"
  | "GLOBAL_TOKEN_CAP_REACHED";

interface UsageLimitCounts {
  minute: number;
  hour: number;
  day: number;
}

interface UsageBlockInfo {
  blocked: true;
  reason: UsageBlockReason;
  httpStatus: number;
  errorCode: ApiErrorCode;
  message: string;
  dailyTokenUsage: number;
  tokenCap: number;
}

interface UsageAllowedInfo {
  blocked: false;
  dailyTokenUsage: number;
  tokenCap: number;
  ipCounts: UsageLimitCounts;
}

export type UsagePrecheckResult = UsageBlockInfo | UsageAllowedInfo;

const IP_MINUTE_MESSAGE = "Too many requests right now. Please try again shortly.";
const IP_HOUR_MESSAGE = "You've reached the hourly limit for this tool. Please try again later.";
const IP_DAY_MESSAGE = "You've reached the daily usage limit for this tool. Please try again tomorrow.";
const EMERGENCY_MESSAGE = "Translation is temporarily unavailable while we review system usage.";

let usageProtectionStateCache:
  | {
      expiresAt: number;
      value: UsageProtectionState;
    }
  | null = null;
let usageProtectionStateInFlight: Promise<UsageProtectionState> | null = null;
let globalDailyTokenUsageCache:
  | {
      dayKey: string;
      expiresAt: number;
      value: number;
    }
  | null = null;

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function parseInteger(value: string | undefined, fallback: number, min = 1): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < min) {
    return fallback;
  }
  return parsed;
}

function getDefaultStateValues() {
  const env = getServerEnv();

  return {
    usageProtectionEnabled: parseBoolean(
      typeof env.USAGE_PROTECTION_ENABLED === "boolean"
        ? String(env.USAGE_PROTECTION_ENABLED)
        : process.env.USAGE_PROTECTION_ENABLED,
      true,
    ),
    ipLimitPerMinute: parseInteger(
      typeof env.IP_RATE_LIMIT_PER_MINUTE === "number"
        ? String(env.IP_RATE_LIMIT_PER_MINUTE)
        : process.env.IP_RATE_LIMIT_PER_MINUTE,
      DEFAULT_IP_LIMIT_PER_MINUTE,
    ),
    ipLimitPerHour: parseInteger(
      typeof env.IP_RATE_LIMIT_PER_HOUR === "number"
        ? String(env.IP_RATE_LIMIT_PER_HOUR)
        : process.env.IP_RATE_LIMIT_PER_HOUR,
      DEFAULT_IP_LIMIT_PER_HOUR,
    ),
    ipLimitPerDay: parseInteger(
      typeof env.IP_RATE_LIMIT_PER_DAY === "number"
        ? String(env.IP_RATE_LIMIT_PER_DAY)
        : process.env.IP_RATE_LIMIT_PER_DAY,
      DEFAULT_IP_LIMIT_PER_DAY,
    ),
    globalDailyTokenCap: parseInteger(
      typeof env.GLOBAL_DAILY_TOKEN_CAP === "number"
        ? String(env.GLOBAL_DAILY_TOKEN_CAP)
        : process.env.GLOBAL_DAILY_TOKEN_CAP,
      DEFAULT_GLOBAL_DAILY_TOKEN_CAP,
      1_000,
    ),
    autoEmergencyShutdownEnabled: parseBoolean(
      typeof env.AUTO_EMERGENCY_SHUTDOWN_ENABLED === "boolean"
        ? String(env.AUTO_EMERGENCY_SHUTDOWN_ENABLED)
        : process.env.AUTO_EMERGENCY_SHUTDOWN_ENABLED,
      true,
    ),
    alertEmail: env.ALERT_ADMIN_EMAIL?.trim() || null,
  };
}

async function resolveAlertEmail(db: DbClient, stateAlertEmail?: string | null): Promise<string | null> {
  const preferred = stateAlertEmail?.trim() || process.env.ALERT_ADMIN_EMAIL?.trim() || null;
  if (preferred) {
    return preferred;
  }

  const admin = await db.user.findFirst({
    where: { role: "ADMIN" },
    orderBy: { createdAt: "asc" },
    select: { email: true },
  });

  return admin?.email || null;
}

function toUtcDayKey(referenceDate = new Date()) {
  return referenceDate.toISOString().slice(0, 10);
}

function setUsageProtectionStateCache(state: UsageProtectionState) {
  usageProtectionStateCache = {
    value: state,
    expiresAt: Date.now() + USAGE_STATE_CACHE_TTL_MS,
  };
}

function invalidateGlobalDailyTokenUsageCache() {
  globalDailyTokenUsageCache = null;
}

export async function getOrCreateUsageProtectionState(db: DbClient = prisma) {
  const isDefaultClient = db === prisma;
  const now = Date.now();

  if (isDefaultClient && usageProtectionStateCache && usageProtectionStateCache.expiresAt > now) {
    return usageProtectionStateCache.value;
  }

  if (isDefaultClient && usageProtectionStateInFlight) {
    return usageProtectionStateInFlight;
  }

  const defaults = getDefaultStateValues();
  const resolveState = async () => {
    const existing = await db.usageProtectionState.findUnique({
      where: { id: USAGE_PROTECTION_STATE_ID },
    });

    if (existing) {
      return existing;
    }

    try {
      return await db.usageProtectionState.create({
        data: {
          id: USAGE_PROTECTION_STATE_ID,
          usageProtectionEnabled: defaults.usageProtectionEnabled,
          ipLimitPerMinute: defaults.ipLimitPerMinute,
          ipLimitPerHour: defaults.ipLimitPerHour,
          ipLimitPerDay: defaults.ipLimitPerDay,
          globalDailyTokenCap: defaults.globalDailyTokenCap,
          autoEmergencyShutdownEnabled: defaults.autoEmergencyShutdownEnabled,
          translationsEnabled: true,
          alertEmail: defaults.alertEmail,
        },
      });
    } catch (error) {
      const raced = await db.usageProtectionState.findUnique({
        where: { id: USAGE_PROTECTION_STATE_ID },
      });
      if (raced) {
        return raced;
      }
      throw error;
    }
  };

  if (!isDefaultClient) {
    return resolveState();
  }

  const task = resolveState()
    .then((state) => {
      setUsageProtectionStateCache(state);
      return state;
    })
    .finally(() => {
      if (usageProtectionStateInFlight === task) {
        usageProtectionStateInFlight = null;
      }
    });

  usageProtectionStateInFlight = task;
  return task;
}

export function getUtcDayWindow(referenceDate = new Date()): { start: Date; endExclusive: Date } {
  const start = new Date(
    Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), referenceDate.getUTCDate(), 0, 0, 0, 0),
  );
  const endExclusive = new Date(start);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
  return { start, endExclusive };
}

export function getRequestIdentity(request: Request) {
  const ip = extractClientIp(request);
  return {
    ip,
    ipHash: hashIp(ip),
    userAgent: request.headers.get("user-agent") || undefined,
  };
}

async function getIpUsageCounts(ipHash: string, now = new Date()): Promise<UsageLimitCounts> {
  const minuteStart = new Date(now.getTime() - 60_000);
  const hourStart = new Date(now.getTime() - 60 * 60_000);
  const { start: dayStart, endExclusive: dayEndExclusive } = getUtcDayWindow(now);

  const rows = await prisma.translationLog.findMany({
    where: {
      ipHash,
      createdAt: {
        gte: dayStart,
        lt: dayEndExclusive,
      },
    },
    select: {
      createdAt: true,
    },
  });

  let minute = 0;
  let hour = 0;

  for (const row of rows) {
    const createdAtMs = row.createdAt.getTime();
    if (createdAtMs >= hourStart.getTime()) {
      hour += 1;
      if (createdAtMs >= minuteStart.getTime()) {
        minute += 1;
      }
    }
  }

  return {
    minute,
    hour,
    day: rows.length,
  };
}

export async function getGlobalDailyTokenUsage(
  referenceDate = new Date(),
  options?: { forceRefresh?: boolean },
): Promise<number> {
  const forceRefresh = options?.forceRefresh === true;
  const dayKey = toUtcDayKey(referenceDate);
  const now = Date.now();

  if (
    !forceRefresh &&
    globalDailyTokenUsageCache &&
    globalDailyTokenUsageCache.dayKey === dayKey &&
    globalDailyTokenUsageCache.expiresAt > now
  ) {
    return globalDailyTokenUsageCache.value;
  }

  const { start, endExclusive } = getUtcDayWindow(referenceDate);
  const aggregate = await prisma.translationLog.aggregate({
    where: {
      status: TranslationStatus.SUCCESS,
      createdAt: {
        gte: start,
        lt: endExclusive,
      },
    },
    _sum: {
      totalTokens: true,
    },
  });

  const total = aggregate._sum.totalTokens || 0;
  globalDailyTokenUsageCache = {
    dayKey,
    value: total,
    expiresAt: now + DAILY_TOKEN_USAGE_CACHE_TTL_MS,
  };
  return total;
}

export function registerSuccessfulTokenUsage(totalTokens: number | null | undefined, recordedAt = new Date()) {
  if (typeof totalTokens !== "number" || !Number.isFinite(totalTokens) || totalTokens <= 0 || !globalDailyTokenUsageCache) {
    return;
  }

  const dayKey = toUtcDayKey(recordedAt);
  if (globalDailyTokenUsageCache.dayKey !== dayKey) {
    return;
  }

  globalDailyTokenUsageCache = {
    ...globalDailyTokenUsageCache,
    value: globalDailyTokenUsageCache.value + totalTokens,
    expiresAt: Date.now() + DAILY_TOKEN_USAGE_CACHE_TTL_MS,
  };
}

function blockResponse(
  reason: UsageBlockReason,
  dailyTokenUsage: number,
  tokenCap: number,
): UsagePrecheckResult {
  const map: Record<
    UsageBlockReason,
    {
      httpStatus: number;
      errorCode: ApiErrorCode;
      message: string;
    }
  > = {
    IP_MINUTE_LIMIT: {
      httpStatus: 429,
      errorCode: "RATE_LIMITED",
      message: IP_MINUTE_MESSAGE,
    },
    IP_HOUR_LIMIT: {
      httpStatus: 429,
      errorCode: "RATE_LIMITED",
      message: IP_HOUR_MESSAGE,
    },
    IP_DAY_LIMIT: {
      httpStatus: 429,
      errorCode: "RATE_LIMITED",
      message: IP_DAY_MESSAGE,
    },
    EMERGENCY_SHUTDOWN: {
      httpStatus: 503,
      errorCode: "TRANSLATION_UNAVAILABLE",
      message: EMERGENCY_MESSAGE,
    },
    GLOBAL_TOKEN_CAP_REACHED: {
      httpStatus: 503,
      errorCode: "TRANSLATION_UNAVAILABLE",
      message: EMERGENCY_MESSAGE,
    },
  };

  return {
    blocked: true,
    reason,
    dailyTokenUsage,
    tokenCap,
    ...map[reason],
  };
}

export async function triggerEmergencyShutdown(params: {
  reason: string;
  tokenUsageAtTrigger: number;
  tokenCapAtTrigger: number;
}) {
  const now = new Date();

  const result = await prisma.$transaction(async (tx) => {
    const state = await getOrCreateUsageProtectionState(tx);

    if (!state.autoEmergencyShutdownEnabled || !state.usageProtectionEnabled) {
      return { triggered: false, eventId: null as string | null, state };
    }

    const updated = await tx.usageProtectionState.updateMany({
      where: {
        id: state.id,
        translationsEnabled: true,
      },
      data: {
        translationsEnabled: false,
        shutdownReason: params.reason,
        shutdownTriggeredAt: now,
      },
    });

    if (updated.count === 0) {
      const current = await tx.usageProtectionState.findUnique({
        where: { id: state.id },
      });
      return {
        triggered: false,
        eventId: null as string | null,
        state: current || state,
      };
    }

    const alertEmail = await resolveAlertEmail(tx, state.alertEmail);

    const event = await tx.usageProtectionEvent.create({
      data: {
        stateId: state.id,
        type: UsageProtectionEventType.EMERGENCY_SHUTDOWN,
        reason: params.reason,
        tokenUsageAtTrigger: params.tokenUsageAtTrigger,
        tokenCapAtTrigger: params.tokenCapAtTrigger,
        alertEmail,
      },
    });

    const finalState = await tx.usageProtectionState.update({
      where: { id: state.id },
      data: {
        lastShutdownEventId: event.id,
      },
    });

    return {
      triggered: true,
      eventId: event.id,
      state: finalState,
    };
  });

  if (result.triggered && result.eventId) {
    await sendEmergencyAlertIfNeeded(result.eventId);
  }

  setUsageProtectionStateCache(result.state);

  return result;
}

export async function sendEmergencyAlertIfNeeded(eventId: string) {
  const event = await prisma.usageProtectionEvent.findUnique({
    where: { id: eventId },
    include: {
      state: true,
    },
  });

  if (!event) {
    return;
  }

  if (event.type !== UsageProtectionEventType.EMERGENCY_SHUTDOWN) {
    return;
  }

  if (event.alertSentAt) {
    return;
  }

  const alertEmail = event.alertEmail || (await resolveAlertEmail(prisma, event.state.alertEmail));
  if (!alertEmail) {
    await prisma.usageProtectionEvent.update({
      where: { id: event.id },
      data: {
        alertError: "No alert recipient configured.",
      },
    });
    return;
  }

  const { start, endExclusive } = getUtcDayWindow(event.createdAt);

  const topRows = await prisma.translationLog.groupBy({
    by: ["translatorId"],
    where: {
      createdAt: {
        gte: start,
        lt: endExclusive,
      },
      status: TranslationStatus.SUCCESS,
    },
    _count: {
      _all: true,
    },
    _sum: {
      totalTokens: true,
    },
    orderBy: {
      _sum: {
        totalTokens: "desc",
      },
    },
    take: 5,
  });

  const translatorMap = new Map(
    (
      await prisma.translator.findMany({
        where: {
          id: {
            in: topRows.map((row) => row.translatorId),
          },
        },
        select: {
          id: true,
          name: true,
          slug: true,
        },
      })
    ).map((row) => [row.id, row]),
  );

  const topTranslators = topRows.map((row) => ({
    name: translatorMap.get(row.translatorId)?.name || "Unknown translator",
    slug: translatorMap.get(row.translatorId)?.slug || "unknown",
    totalTokens: row._sum.totalTokens || 0,
    requestCount: row._count._all,
  }));

  const sendResult = await sendEmergencyShutdownAlertEmail({
    to: alertEmail,
    reason: event.reason,
    triggeredAt: event.createdAt.toISOString(),
    tokenUsage: event.tokenUsageAtTrigger || 0,
    tokenCap: event.tokenCapAtTrigger || event.state.globalDailyTokenCap,
    topTranslators,
  });

  await prisma.usageProtectionEvent.update({
    where: { id: event.id },
    data: sendResult.sent
      ? {
          alertSentAt: new Date(),
          alertError: null,
        }
      : {
          alertError: sendResult.error || "Unknown email send failure.",
        },
  });
}

export async function runUsageProtectionPrecheck(params: { ipHash: string }): Promise<UsagePrecheckResult> {
  const state = await getOrCreateUsageProtectionState();
  const tokenCap = state.globalDailyTokenCap;
  let dailyTokenUsageCache: number | null = null;

  const resolveDailyTokenUsage = async () => {
    if (dailyTokenUsageCache == null) {
      dailyTokenUsageCache = await getGlobalDailyTokenUsage();
    }
    return dailyTokenUsageCache;
  };

  if (!state.translationsEnabled) {
    return blockResponse("EMERGENCY_SHUTDOWN", await resolveDailyTokenUsage(), tokenCap);
  }

  if (!state.usageProtectionEnabled) {
    return {
      blocked: false,
      dailyTokenUsage: 0,
      tokenCap,
      ipCounts: { minute: 0, hour: 0, day: 0 },
    };
  }

  if (state.autoEmergencyShutdownEnabled) {
    const dailyTokenUsage = await resolveDailyTokenUsage();
    if (dailyTokenUsage >= tokenCap) {
      await triggerEmergencyShutdown({
        reason: "Global daily token cap reached.",
        tokenUsageAtTrigger: dailyTokenUsage,
        tokenCapAtTrigger: tokenCap,
      });

      return blockResponse("GLOBAL_TOKEN_CAP_REACHED", dailyTokenUsage, tokenCap);
    }
  }

  const ipCounts = await getIpUsageCounts(params.ipHash);

  if (ipCounts.minute >= state.ipLimitPerMinute) {
    return blockResponse("IP_MINUTE_LIMIT", await resolveDailyTokenUsage(), tokenCap);
  }

  if (ipCounts.hour >= state.ipLimitPerHour) {
    return blockResponse("IP_HOUR_LIMIT", await resolveDailyTokenUsage(), tokenCap);
  }

  if (ipCounts.day >= state.ipLimitPerDay) {
    return blockResponse("IP_DAY_LIMIT", await resolveDailyTokenUsage(), tokenCap);
  }

  return {
    blocked: false,
    dailyTokenUsage: dailyTokenUsageCache ?? 0,
    tokenCap,
    ipCounts,
  };
}

export async function evaluatePostSuccessTokenCap() {
  const state = await getOrCreateUsageProtectionState();

  if (!state.usageProtectionEnabled || !state.autoEmergencyShutdownEnabled || !state.translationsEnabled) {
    return { triggered: false };
  }

  const dailyTokens = await getGlobalDailyTokenUsage();
  if (dailyTokens < state.globalDailyTokenCap) {
    return { triggered: false };
  }

  return triggerEmergencyShutdown({
    reason: "Global daily token cap reached.",
    tokenUsageAtTrigger: dailyTokens,
    tokenCapAtTrigger: state.globalDailyTokenCap,
  });
}

function mapStateDto(state: Awaited<ReturnType<typeof getOrCreateUsageProtectionState>>) {
  return {
    id: state.id,
    usageProtectionEnabled: state.usageProtectionEnabled,
    ipLimitPerMinute: state.ipLimitPerMinute,
    ipLimitPerHour: state.ipLimitPerHour,
    ipLimitPerDay: state.ipLimitPerDay,
    globalDailyTokenCap: state.globalDailyTokenCap,
    autoEmergencyShutdownEnabled: state.autoEmergencyShutdownEnabled,
    translationsEnabled: state.translationsEnabled,
    shutdownReason: state.shutdownReason,
    shutdownTriggeredAt: state.shutdownTriggeredAt ? state.shutdownTriggeredAt.toISOString() : null,
    alertEmail: state.alertEmail,
    lastShutdownEventId: state.lastShutdownEventId,
    updatedAt: state.updatedAt.toISOString(),
  };
}

export async function getUsageProtectionDashboardData(): Promise<UsageProtectionDashboardData> {
  const state = await getOrCreateUsageProtectionState();
  const { start, endExclusive } = getUtcDayWindow();

  const [requestCounts, tokenSum, blockedByReasonRows, lastShutdownEvent, topRows] = await Promise.all([
    prisma.translationLog.groupBy({
      by: ["status"],
      where: {
        createdAt: {
          gte: start,
          lt: endExclusive,
        },
      },
      _count: { _all: true },
    }),
    prisma.translationLog.aggregate({
      where: {
        createdAt: {
          gte: start,
          lt: endExclusive,
        },
        status: TranslationStatus.SUCCESS,
      },
      _sum: { totalTokens: true },
    }),
    prisma.translationLog.groupBy({
      by: ["errorCode"],
      where: {
        createdAt: {
          gte: start,
          lt: endExclusive,
        },
        status: TranslationStatus.BLOCKED,
      },
      _count: { _all: true },
      orderBy: {
        _count: {
          errorCode: "desc",
        },
      },
      take: 6,
    }),
    prisma.usageProtectionEvent.findUnique({
      where: { id: state.lastShutdownEventId || "" },
    }),
    prisma.translationLog.groupBy({
      by: ["translatorId"],
      where: {
        createdAt: {
          gte: start,
          lt: endExclusive,
        },
        status: TranslationStatus.SUCCESS,
      },
      _count: { _all: true },
      _sum: { totalTokens: true },
      orderBy: {
        _sum: {
          totalTokens: "desc",
        },
      },
      take: 6,
    }),
  ]);

  const totalRequests = requestCounts.reduce((acc, item) => acc + item._count._all, 0);
  const blockedRequests =
    requestCounts.find((item) => item.status === TranslationStatus.BLOCKED)?._count._all || 0;
  const successfulRequests =
    requestCounts.find((item) => item.status === TranslationStatus.SUCCESS)?._count._all || 0;
  const failedRequests =
    requestCounts.find((item) => item.status === TranslationStatus.FAILURE)?._count._all || 0;
  const totalTokens = tokenSum._sum.totalTokens || 0;
  const remainingTokens = Math.max(0, state.globalDailyTokenCap - totalTokens);

  const topTranslatorIds = topRows.map((row) => row.translatorId);
  const topTranslatorMap = new Map(
    (
      await prisma.translator.findMany({
        where: {
          id: {
            in: topTranslatorIds,
          },
        },
        select: {
          id: true,
          name: true,
          slug: true,
        },
      })
    ).map((row) => [row.id, row]),
  );

  return {
    state: mapStateDto(state),
    today: {
      totalRequests,
      blockedRequests,
      successfulRequests,
      failedRequests,
      totalTokens,
      tokenCap: state.globalDailyTokenCap,
      remainingTokens,
      blockedByReason: blockedByReasonRows.map((row) => ({
        code: row.errorCode || "UNKNOWN_BLOCK",
        count: row._count._all,
      })),
    },
    topTranslatorsByTokens: topRows.map((row) => ({
      translatorId: row.translatorId,
      name: topTranslatorMap.get(row.translatorId)?.name || "Unknown translator",
      slug: topTranslatorMap.get(row.translatorId)?.slug || "unknown",
      requestCount: row._count._all,
      totalTokens: row._sum.totalTokens || 0,
    })),
    lastShutdownEvent: lastShutdownEvent
      ? {
          id: lastShutdownEvent.id,
          type: lastShutdownEvent.type,
          reason: lastShutdownEvent.reason,
          tokenUsageAtTrigger: lastShutdownEvent.tokenUsageAtTrigger,
          tokenCapAtTrigger: lastShutdownEvent.tokenCapAtTrigger,
          alertEmail: lastShutdownEvent.alertEmail,
          alertSentAt: lastShutdownEvent.alertSentAt ? lastShutdownEvent.alertSentAt.toISOString() : null,
          alertError: lastShutdownEvent.alertError,
          createdAt: lastShutdownEvent.createdAt.toISOString(),
        }
      : null,
  };
}

export async function updateUsageProtectionSettings(input: UsageProtectionSettingsInput) {
  const state = await getOrCreateUsageProtectionState();

  const updated = await prisma.usageProtectionState.update({
    where: { id: state.id },
    data: {
      usageProtectionEnabled: input.usageProtectionEnabled,
      ipLimitPerMinute: input.ipLimitPerMinute,
      ipLimitPerHour: input.ipLimitPerHour,
      ipLimitPerDay: input.ipLimitPerDay,
      globalDailyTokenCap: input.globalDailyTokenCap,
      autoEmergencyShutdownEnabled: input.autoEmergencyShutdownEnabled,
      alertEmail: input.alertEmail?.trim() || null,
    },
  });

  setUsageProtectionStateCache(updated);
  invalidateGlobalDailyTokenUsageCache();

  return mapStateDto(updated);
}

export async function manuallyReenableTranslations(params?: { actorId?: string; reason?: string }) {
  const result = await prisma.$transaction(async (tx) => {
    const state = await getOrCreateUsageProtectionState(tx);
    if (state.translationsEnabled) {
      return {
        reenabled: false,
        state,
      };
    }

    const updated = await tx.usageProtectionState.update({
      where: { id: state.id },
      data: {
        translationsEnabled: true,
        shutdownReason: null,
        shutdownTriggeredAt: null,
      },
    });

    const { start, endExclusive } = getUtcDayWindow();
    const aggregate = await tx.translationLog.aggregate({
      where: {
        status: TranslationStatus.SUCCESS,
        createdAt: {
          gte: start,
          lt: endExclusive,
        },
      },
      _sum: {
        totalTokens: true,
      },
    });

    await tx.usageProtectionEvent.create({
      data: {
        stateId: state.id,
        type: UsageProtectionEventType.MANUAL_REENABLE,
        reason: params?.reason?.trim() || "Manual re-enable from admin console.",
        tokenUsageAtTrigger: aggregate._sum.totalTokens || 0,
        tokenCapAtTrigger: updated.globalDailyTokenCap,
        createdBy: params?.actorId || null,
      },
    });

    return {
      reenabled: true,
      state: updated,
    };
  });

  setUsageProtectionStateCache(result.state);
  invalidateGlobalDailyTokenUsageCache();

  return {
    reenabled: result.reenabled,
    state: mapStateDto(result.state),
  };
}
