import { GrowthActivityActorKind, Prisma } from "@prisma/client";

import { recordGrowthActivity } from "@/lib/growth/activity";
import { assessPinterestQuota } from "@/lib/growth/operations/quota-probe";
import { PinterestOneGetBudget } from "@/lib/growth/pinterest/one-get-budget";
import { prisma } from "@/lib/prisma";

const ACTION = "PINTEREST_ONE_SYNC_API_REQUEST_RESERVED";
const WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Durable per-account, one-request-per-24h admission for the manually approved
 * one-sync qualification only. It is NOT a quota for the general Pinterest API.
 *
 * A row lock serializes all qualifications using this helper; the immutable
 * activity reservation is committed before any network call, even if the
 * external request later times out or returns 429.
 */
export async function reserveOneAccountSyncRequest(
  tx: Prisma.TransactionClient, accountId: string, correlationKey: string,
  now = new Date(),
) {
  const locked = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "GrowthPinterestAccount" WHERE "id" = ${accountId} FOR UPDATE
  `;
  if (locked.length !== 1) throw Error("PINTEREST_ACCOUNT_NOT_FOUND");
  const since = new Date(now.getTime() - WINDOW_MS);
  const existing = await tx.growthActivity.count({
    where: { entityType: "GrowthPinterestAccount", entityId: accountId,
      action: ACTION, createdAt: { gte: since } },
  });
  if (existing !== 0) throw Error("PINTEREST_ONE_SYNC_24H_BUDGET_EXHAUSTED");
  await recordGrowthActivity({
    actorKind: GrowthActivityActorKind.SYSTEM,
    entityType: "GrowthPinterestAccount", entityId: accountId, action: ACTION,
    correlationKey, summary: { maxRequests: 1, windowHours: 24, reason: "OWNER_APPROVED_ONE_SYNC" },
  }, tx);
}

/**
 * Bound to exactly one job by the short-lived worker. Token refresh, retries,
 * alternative paths, redirecting requests and second GETs all fail closed.
 * Validate the provider's remaining/reset header before accepting the result.
 */
export function oneAccountSyncFetch(jobId: string, fetchImpl: typeof fetch = fetch): typeof fetch {
  if (!/^[A-Za-z0-9_-]{1,191}$/.test(jobId) ||
      process.env.GROWTH_PINTEREST_ONE_SYNC_JOB_ID !== jobId) {
    throw Error("PINTEREST_ONE_SYNC_SCOPE_INVALID");
  }
  const budget = new PinterestOneGetBudget();
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : "";
    if (url !== "https://api.pinterest.com/v5/user_account" ||
        (init?.method !== undefined && init.method !== "GET")) {
      throw Error("PINTEREST_ONE_SYNC_UNAUTHORIZED_ENDPOINT");
    }
    budget.claim();
    const response = await fetchImpl(url, {
      ...init, method: "GET", redirect: "error", signal: AbortSignal.timeout(10_000),
    });
    budget.observe(response.status);
    assessPinterestQuota(response.headers);
    return response;
  }) as typeof fetch;
}
