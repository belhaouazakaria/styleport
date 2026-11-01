import { GrowthActivityActorKind, Prisma } from "@prisma/client";

import { recordGrowthActivity } from "@/lib/growth/activity";
import { prisma } from "@/lib/prisma";

/**
 * Deliberately conservative GLOBAL production throttle, independent of the
 * Pinterest quota headers. Shared by the web app, worker and operator probes.
 * No new table: immutable GrowthActivity rows persist across restarts.
 *
 * Admission is committed before any request. Every attempt, including a
 * network timeout, consumes its full allowance. No refunds or hidden retries.
 */
export const PINTEREST_GLOBAL_HOURLY_CEILING = 4;
export const PINTEREST_GLOBAL_DAILY_CEILING = 16;
const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;
const ENTITY_TYPE = "GrowthPinterestProviderBudget";
const ENTITY_ID = "production-global";
const RESERVED = "PINTEREST_GLOBAL_API_REQUEST_RESERVED";
const COOLDOWN = "PINTEREST_GLOBAL_API_COOLDOWN";

export class PinterestGlobalBudgetBlocked extends Error {
  constructor(readonly code:
    "ADMISSION_CLOSED" | "GLOBAL_QUOTA_EXHAUSTED" |
    "PROVIDER_COOLDOWN" | "UNSAFE_ENDPOINT" | "PROVIDER_QUOTA_UNKNOWN" |
    "TRANSPORT_AMBIGUOUS") {
    super(code);
  }
}

function actionWhere(action: string, since: Date) {
  return {
    entityType: ENTITY_TYPE, entityId: ENTITY_ID, action, createdAt: { gte: since },
  };
}

/**
 * The locked GrowthSettings singleton serializes reservations across all app
 * processes. This is NOT a global Redis lock or an in-memory mutex.
 * The transaction must commit before a provider call starts.
 */
export async function reservePinterestGlobalAttempt() {
  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "GrowthSettings" WHERE "id" = 'global' FOR UPDATE
    `;
    if (locked.length !== 1) throw new PinterestGlobalBudgetBlocked("ADMISSION_CLOSED");
    const now = new Date();
    const [cooldowns, hourly, daily] = await Promise.all([
      tx.growthActivity.count({ where: actionWhere(COOLDOWN, new Date(now.getTime() - HOUR)) }),
      tx.growthActivity.count({ where: actionWhere(RESERVED, new Date(now.getTime() - HOUR)) }),
      tx.growthActivity.count({ where: actionWhere(RESERVED, new Date(now.getTime() - DAY)) }),
    ]);
    if (cooldowns > 0) throw new PinterestGlobalBudgetBlocked("PROVIDER_COOLDOWN");
    if (hourly >= PINTEREST_GLOBAL_HOURLY_CEILING ||
        daily >= PINTEREST_GLOBAL_DAILY_CEILING) {
      throw new PinterestGlobalBudgetBlocked("GLOBAL_QUOTA_EXHAUSTED");
    }
    await recordGrowthActivity({
      actorKind: GrowthActivityActorKind.SYSTEM, entityType: ENTITY_TYPE,
      entityId: ENTITY_ID, action: RESERVED,
      summary: { globalHourlyCeiling: PINTEREST_GLOBAL_HOURLY_CEILING,
        globalDailyCeiling: PINTEREST_GLOBAL_DAILY_CEILING },
    }, tx);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 10_000 });
}

/** A fail-closed one-hour pause on ambiguous provider signals. */
async function recordPinterestGlobalCooldown(reason: "RATE_LIMITED" | "UNKNOWN_QUOTA" | "TRANSPORT" | "PROVIDER_ERROR") {
  await recordGrowthActivity({
    actorKind: GrowthActivityActorKind.SYSTEM, entityType: ENTITY_TYPE,
    entityId: ENTITY_ID, action: COOLDOWN, summary: { reason, windowMinutes: 60 },
  });
}

function isOfficialPinterestV5Url(value: RequestInfo | URL) {
  const raw = typeof value === "string" ? value : value instanceof URL ? value.href : "";
  try {
    const url = new URL(raw);
    return url.origin === "https://api.pinterest.com" &&
      url.pathname.startsWith("/v5/") &&
      url.username === "" && url.password === "" && url.hash === "";
  } catch { return false; }
}

/**
 * Used immediately around each real HTTP request, including token refresh,
 * pagination, account/analytics GETs and Pin writes. Child transport wrappers
 * retain their stricter constraints, including the Phase14E one-GET guard.
 *
 * Test/development calls are not production quota evidence and are not charged.
 */
export async function budgetedPinterestFetch(
  input: RequestInfo | URL, init: RequestInit | undefined,
  transport: typeof fetch = fetch,
): Promise<Response> {
  if (process.env.NODE_ENV !== "production") return transport(input, init);
  if (!isOfficialPinterestV5Url(input)) {
    throw new PinterestGlobalBudgetBlocked("UNSAFE_ENDPOINT");
  }
  await reservePinterestGlobalAttempt();
  let response: Response;
  try {
    response = await transport(input, { ...init, redirect: "error" });
  } catch {
    await recordPinterestGlobalCooldown("TRANSPORT").catch(() => undefined);
    throw new PinterestGlobalBudgetBlocked("TRANSPORT_AMBIGUOUS");
  }
  if (response.status === 429 || response.status >= 500) {
    await recordPinterestGlobalCooldown(response.status === 429 ? "RATE_LIMITED" : "PROVIDER_ERROR");
    return response;
  }
  if (response.ok && new URL(typeof input === "string" ? input : input.toString()).pathname !== "/v5/oauth/token") {
    // OAuth token responses may not expose regular API category headers. They
    // still consume the shared local cap, but cannot imply fresh quota.
    const remaining = response.headers.get("x-ratelimit-remaining");
    const reset = response.headers.get("x-ratelimit-reset");
    const limit = response.headers.get("x-ratelimit-limit");
    if (!limit || !/^(?:0|[1-9]\\d{0,7})$/.test(remaining || "") ||
        !/^(?:0|[1-9]\\d{0,7})$/.test(reset || "") ||
        Number(remaining) <= 5 || Number(reset) > 86_400) {
      await recordPinterestGlobalCooldown("UNKNOWN_QUOTA");
      throw new PinterestGlobalBudgetBlocked("PROVIDER_QUOTA_UNKNOWN");
    }
  }
  return response;
}
