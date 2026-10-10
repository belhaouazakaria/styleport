
import { GrowthPinterestConnectionStatus } from "@prisma/client";
import type { z } from "zod";

import { NonRetryableGrowthJobError, RetryableGrowthJobError } from "@/lib/growth/errors";
import { requirePinterestConfiguration } from "@/lib/growth/pinterest/config";
import {
  analyticsDateRange,
  PINTEREST_CORE_ACCOUNT_METRICS,
  PINTEREST_CORE_PIN_METRICS,
} from "@/lib/growth/pinterest/analytics-contract";
import {
  pinterestAccountAnalyticsSchema,
  pinterestBoardsPageSchema,
  pinterestCreatePinResponseSchema,
  pinterestPinAnalyticsSchema,
  pinterestPinsPageSchema,
  pinterestTopPinsAnalyticsSchema,
  pinterestUserAccountSchema,
} from "@/lib/growth/pinterest/schemas";
import { getValidPinterestAccessToken } from "@/lib/growth/pinterest/tokens";
import { prisma } from "@/lib/prisma";

export interface PinterestRateLimitMetadata { limit: string | null; remaining: string | null; reset: string | null }

export class PinterestApiError extends Error {
  constructor(readonly status: number, readonly retryable: boolean, readonly retryAfterMs?: number) {
    super(`Pinterest API request failed with HTTP ${status}.`);
  }
}

export class PinterestCreateAmbiguousError extends Error {
  constructor(message: string, readonly rateLimit: PinterestRateLimitMetadata = { limit: null, remaining: null, reset: null }) { super(message); }
}

export class PinterestRateLimitError extends RetryableGrowthJobError {
  constructor(message: string, retryAfterMs: number | undefined, readonly rateLimit: PinterestRateLimitMetadata) { super(message, retryAfterMs); }
}

function rateLimitMetadata(headers: Headers): PinterestRateLimitMetadata {
  return { limit: headers.get("x-ratelimit-limit"), remaining: headers.get("x-ratelimit-remaining"), reset: headers.get("x-ratelimit-reset") };
}

async function pinterestFetch<T>(params: {
  path: string; responseName: string; schema: z.ZodType<T>; accessToken: string; fetchImpl?: typeof fetch;
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
  if (!parsed.success) throw new NonRetryableGrowthJobError(pinterestSchemaError(params.responseName, parsed.error.issues));
  return { data: parsed.data, rateLimit: metadata };
}

function pinterestSchemaError(responseName: string, issues: z.core.$ZodIssue[]) {
  const details = issues.slice(0, 3).map((issue) => {
    const path = issue.path.length
      ? issue.path.map((part) => typeof part === "number" ? String(part) : String(part).replace(/[^A-Za-z0-9_-]/g, "?").slice(0, 48)).join(".")
      : "response";
    return `${path} (${issue.code})`;
  }).join("; ");
  return `Pinterest ${responseName} was invalid at ${details || "response"}.`.slice(0, 500);
}

async function authenticatedPinterestGet<T>(params: {
  accountId: string; path: string; responseName: string; schema: z.ZodType<T>; fetchImpl?: typeof fetch;
}) {
  const accessToken = await getValidPinterestAccessToken(params.accountId, params.fetchImpl);
  try {
    return await pinterestFetch({ path: params.path, responseName: params.responseName, schema: params.schema, accessToken, fetchImpl: params.fetchImpl });
  } catch (error) {
    if (error instanceof PinterestApiError) {
      if (error.status === 401) {
        await prisma.growthPinterestAccount.updateMany({
          where: { id: params.accountId },
          data: { connectionStatus: GrowthPinterestConnectionStatus.REAUTH_REQUIRED, lastConnectionError: error.message },
        });
        throw new NonRetryableGrowthJobError("Pinterest rejected the account credential; reconnect required.");
      }
      if (!error.retryable) throw new NonRetryableGrowthJobError(error.message);
      throw new RetryableGrowthJobError(error.message, error.retryAfterMs);
    }
    throw error;
  }
}

export async function fetchPinterestUserAccountWithToken(accessToken: string, fetchImpl?: typeof fetch) {
  return pinterestFetch({ path: "/user_account", responseName: "user account response", schema: pinterestUserAccountSchema, accessToken, fetchImpl });
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
    return await pinterestFetch({ path: `/boards?${query}`, responseName: "board inventory response", schema: pinterestBoardsPageSchema, accessToken, fetchImpl });
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

export async function getPinterestPinsPage(accountId: string, bookmark?: string, fetchImpl?: typeof fetch, domain?: string) {
  const query = new URLSearchParams({ page_size: "250", pin_metrics: "false" });
  if (bookmark) query.set("bookmark", bookmark);
  if (domain) query.set("domain", domain);
  return authenticatedPinterestGet({
    accountId, path: `/pins?${query}`, responseName: "Pin inventory response", schema: pinterestPinsPageSchema, fetchImpl,
  });
}

export async function createPinterestPin(params: { accountId: string; boardId: string; title: string; description: string; link: string; imageUrl: string; fetchImpl?: typeof fetch }) {
  const config = requirePinterestConfiguration();
  const accessToken = await getValidPinterestAccessToken(params.accountId, params.fetchImpl);
  let response: Response;
  try {
    response = await (params.fetchImpl || fetch)(`${config.apiBaseUrl}/pins`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({ board_id: params.boardId, title: params.title, description: params.description, link: params.link, media_source: { source_type: "image_url", url: params.imageUrl, is_standard: true } }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new PinterestCreateAmbiguousError("Pinterest Create Pin ended without a confirmed response.");
  }
  const metadata = rateLimitMetadata(response.headers);
  const raw: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const retryAfter = Number(response.headers.get("retry-after"));
    if (response.status === 401) {
      await prisma.growthPinterestAccount.updateMany({ where: { id: params.accountId }, data: { connectionStatus: GrowthPinterestConnectionStatus.REAUTH_REQUIRED, lastConnectionError: "Pinterest API request failed with HTTP 401." } });
      throw new NonRetryableGrowthJobError("Pinterest rejected the account credential; reconnect required.");
    }
    if (response.status === 429) throw new PinterestRateLimitError("Pinterest rate limit reached.", Number.isFinite(retryAfter) ? retryAfter * 1000 : undefined, metadata);
    if (response.status >= 500) throw new PinterestCreateAmbiguousError(`Pinterest Create Pin returned HTTP ${response.status}.`, metadata);
    throw new NonRetryableGrowthJobError(`Pinterest Create Pin was rejected with HTTP ${response.status}.`);
  }
  const parsed = pinterestCreatePinResponseSchema.safeParse(raw);
  if (!parsed.success) throw new PinterestCreateAmbiguousError("Pinterest Create Pin returned an invalid potentially successful response.", metadata);
  return { data: parsed.data, rateLimit: metadata };
}

function organicAnalyticsQuery(range: { startDate: string; endDate: string }, metrics: readonly string[]) {
  const valid = analyticsDateRange(range);
  return new URLSearchParams({
    start_date: valid.startDate,
    end_date: valid.endDate,
    from_claimed_content: "BOTH",
    pin_format: "ALL",
    app_types: "ALL",
    content_type: "ORGANIC",
    source: "YOUR_PINS",
    metric_types: metrics.join(","),
  });
}

export async function getPinterestAccountAnalytics(params: {
  accountId: string; startDate: string; endDate: string; fetchImpl?: typeof fetch;
}) {
  const query = organicAnalyticsQuery(params, PINTEREST_CORE_ACCOUNT_METRICS);
  query.set("split_field", "NO_SPLIT");
  return authenticatedPinterestGet({
    accountId: params.accountId,
    path: `/user_account/analytics?${query}`,
    responseName: "account analytics response",
    schema: pinterestAccountAnalyticsSchema,
    fetchImpl: params.fetchImpl,
  });
}

export async function getPinterestTopPinsAnalytics(params: {
  accountId: string; startDate: string; endDate: string; fetchImpl?: typeof fetch;
}) {
  const query = organicAnalyticsQuery(params, PINTEREST_CORE_ACCOUNT_METRICS);
  query.set("sort_by", "OUTBOUND_CLICK");
  query.set("num_of_pins", "50");
  return authenticatedPinterestGet({
    accountId: params.accountId,
    path: `/user_account/analytics/top_pins?${query}`,
    responseName: "top Pins response",
    schema: pinterestTopPinsAnalyticsSchema,
    fetchImpl: params.fetchImpl,
  });
}

export async function getPinterestPinAnalytics(params: {
  accountId: string; pinterestPinId: string; startDate: string; endDate: string; fetchImpl?: typeof fetch;
}) {
  if (!/^\d+$/.test(params.pinterestPinId)) throw new NonRetryableGrowthJobError("Invalid Pinterest Pin identifier.");
  const valid = analyticsDateRange(params);
  const query = new URLSearchParams({
    start_date: valid.startDate,
    end_date: valid.endDate,
    app_types: "ALL",
    metric_types: PINTEREST_CORE_PIN_METRICS.join(","),
    split_field: "NO_SPLIT",
  });
  return authenticatedPinterestGet({
    accountId: params.accountId,
    path: `/pins/${params.pinterestPinId}/analytics?${query}`,
    responseName: "Pin analytics response",
    schema: pinterestPinAnalyticsSchema,
    fetchImpl: params.fetchImpl,
  });
}
