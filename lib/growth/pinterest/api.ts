
import { GrowthPinterestConnectionStatus } from "@prisma/client";
import type { z } from "zod";

import { NonRetryableGrowthJobError, RetryableGrowthJobError } from "@/lib/growth/errors";
import { requirePinterestConfiguration } from "@/lib/growth/pinterest/config";
import { pinterestBoardsPageSchema, pinterestUserAccountSchema } from "@/lib/growth/pinterest/schemas";
import { getValidPinterestAccessToken } from "@/lib/growth/pinterest/tokens";
import { prisma } from "@/lib/prisma";

export interface PinterestRateLimitMetadata { limit: string | null; remaining: string | null; reset: string | null }

export class PinterestApiError extends Error {
  constructor(readonly status: number, readonly retryable: boolean, readonly retryAfterMs?: number) {
    super(`Pinterest API request failed with HTTP ${status}.`);
  }
}

function rateLimitMetadata(headers: Headers): PinterestRateLimitMetadata {
  return { limit: headers.get("x-ratelimit-limit"), remaining: headers.get("x-ratelimit-remaining"), reset: headers.get("x-ratelimit-reset") };
}

async function pinterestFetch<T>(params: {
  path: string; schema: z.ZodType<T>; accessToken: string; fetchImpl?: typeof fetch;
}): Promise<{ data: T; rateLimit: PinterestRateLimitMetadata }> {
  const config = requirePinterestConfiguration();
  if (!params.path.startsWith("/") || params.path.startsWith("//")) throw new Error("Invalid Pinterest API path.");
  const response = await (params.fetchImpl || fetch)(`${config.apiBaseUrl}${params.path}`, {
    headers: { Authorization: `Bearer ${params.accessToken}`, Accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });
  const metadata = rateLimitMetadata(response.headers);
  const raw: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const retryAfter = Number(response.headers.get("retry-after"));
    throw new PinterestApiError(response.status, response.status === 429 || response.status >= 500, Number.isFinite(retryAfter) ? retryAfter * 1000 : undefined);
  }
  const parsed = params.schema.safeParse(raw);
  if (!parsed.success) throw new NonRetryableGrowthJobError("Pinterest returned an unexpected response shape.");
  return { data: parsed.data, rateLimit: metadata };
}

export async function fetchPinterestUserAccountWithToken(accessToken: string, fetchImpl?: typeof fetch) {
  return pinterestFetch({ path: "/user_account", schema: pinterestUserAccountSchema, accessToken, fetchImpl });
}

export async function getPinterestUserAccount(accountId: string, fetchImpl?: typeof fetch) {
  const accessToken = await getValidPinterestAccessToken(accountId, fetchImpl);
  try {
    return await fetchPinterestUserAccountWithToken(accessToken, fetchImpl);
  } catch (error) {
    if (error instanceof PinterestApiError) {
      if (error.status === 401) {
        await prisma.growthPinterestAccount.updateMany({ where: { id: accountId }, data: { connectionStatus: GrowthPinterestConnectionStatus.REAUTH_REQUIRED, lastConnectionError: error.message } });
        throw new NonRetryableGrowthJobError("Pinterest rejected the account credential; reconnect required.");
      }
      if (!error.retryable) throw new NonRetryableGrowthJobError(error.message);
      throw new RetryableGrowthJobError(error.message, error.retryAfterMs);
    }
    throw error;
  }
}

export async function getPinterestBoardsPage(accountId: string, bookmark?: string, fetchImpl?: typeof fetch) {
  const accessToken = await getValidPinterestAccessToken(accountId, fetchImpl);
  const query = new URLSearchParams({ page_size: "100" });
  if (bookmark) query.set("bookmark", bookmark);
  try {
    return await pinterestFetch({ path: `/boards?${query}`, schema: pinterestBoardsPageSchema, accessToken, fetchImpl });
  } catch (error) {
    if (error instanceof PinterestApiError) {
      if (error.status === 401) {
        await prisma.growthPinterestAccount.updateMany({ where: { id: accountId }, data: { connectionStatus: GrowthPinterestConnectionStatus.REAUTH_REQUIRED, lastConnectionError: error.message } });
        throw new NonRetryableGrowthJobError("Pinterest credential is invalid; reconnect required.");
      }
      if (!error.retryable) throw new NonRetryableGrowthJobError(error.message);
      throw new RetryableGrowthJobError(error.message, error.retryAfterMs);
    }
    throw error;
  }
}
