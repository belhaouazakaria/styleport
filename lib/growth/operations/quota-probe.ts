import { readFileSync } from "node:fs";

import { GrowthPinterestApiEnvironment, GrowthPinterestConnectionStatus } from "@prisma/client";

import { decryptPinterestCredentials } from "@/lib/growth/pinterest/credentials";
import { requirePinterestConfiguration } from "@/lib/growth/pinterest/config";
import { prisma } from "@/lib/prisma";

export type QuotaProbeCode =
  | "RELEASE_MISMATCH" | "GROWTH_NOT_OFF" | "QUEUE_NOT_IDLE"
  | "ACCOUNT_NOT_READY" | "TOKEN_NOT_READY" | "ENV_NOT_READY"
  | "PINTEREST_HTTP_FAILURE" | "QUOTA_UNAVAILABLE" | "QUOTA_LOW"
  | "UNEXPECTED_RESPONSE";

export type SafeQuotaHeaderKind = "ABSENT" | "INTEGER" | "WINDOWS" | "OTHER";
export type SafeQuotaHeaderEvidence = {
  limit: SafeQuotaHeaderKind; remaining: SafeQuotaHeaderKind; reset: SafeQuotaHeaderKind;
  limitStructure: string;
};
export class QuotaProbeBlocked extends Error {
  constructor(public readonly code: QuotaProbeCode,
    public readonly evidence: SafeQuotaHeaderEvidence | null = null) { super(code); }
}

function block(code: QuotaProbeCode, evidence: SafeQuotaHeaderEvidence | null = null): never {
  throw new QuotaProbeBlocked(code, evidence);
}
function quotaHeaderKind(value: string | null): SafeQuotaHeaderKind {
  if (value === null || value === "") return "ABSENT";
  if (/^\d{1,8}$/.test(value)) return "INTEGER";
  if (/^\d{1,8}(?:,\s*\d{1,8};w=\d{1,6}(?:;name="[a-z][a-z0-9_]{0,63}")?)+$/.test(value)) return "WINDOWS";
  return "OTHER";
}

/** Only delimiters and character classes, never raw provider values or token text. */
export function safeQuotaLimitStructure(value: string | null): string {
  if (value === null || value === "") return "ABSENT";
  if (value.length > 120 || !/^[a-zA-Z0-9,;=:. _-]+$/.test(value)) return "REDACTED";
  const structure = value.replace(/[a-zA-Z]+/g, "A").replace(/[0-9]+/g, "N")
    .replace(/ +/g, " ");
  return structure.length <= 96 ? structure : "REDACTED";
}

/** Untrusted Pinterest response headers must be complete and preserve >= 5 requests. */
export function assessPinterestQuota(headers: Pick<Headers, "get">) {
  const rawLimit = headers.get("x-ratelimit-limit");
  const rawRemaining = headers.get("x-ratelimit-remaining");
  const rawReset = headers.get("x-ratelimit-reset");
  const evidence: SafeQuotaHeaderEvidence = {
    limit: quotaHeaderKind(rawLimit), remaining: quotaHeaderKind(rawRemaining),
    reset: quotaHeaderKind(rawReset),
    limitStructure: safeQuotaLimitStructure(rawLimit),
  };
  // Pinterest officially documents composite limits, e.g.
  // "100, 100;w=1, 1000;w=60" (universal and category windows).
  // Validate all windows, but use the first numeric limit with the documented
  // aggregate remaining/reset values. Never infer missing quotas.
  if (typeof rawLimit !== "string" || rawLimit.length > 128 ||
      typeof rawRemaining !== "string" || !/^\d{1,8}$/.test(rawRemaining) ||
      typeof rawReset !== "string" || !/^\d{1,8}$/.test(rawReset))
    return block("QUOTA_UNAVAILABLE", evidence);
  const parts = rawLimit.split(",").map(x => x.trim());
  if (!parts.length || !/^\d{1,8}$/.test(parts[0]) ||
      parts.slice(1).some(x => !/^\d{1,8};w=\d{1,6}(?:;name="[a-z][a-z0-9_]{0,63}")?$/.test(x)))
    return block("QUOTA_UNAVAILABLE", evidence);
  if (parts.slice(1).some(x => Number(x.split(";")[0]) < 1 ||
      Number(x.split("=")[1]) < 1)) return block("QUOTA_UNAVAILABLE", evidence);
  const limit = Number(parts[0]), remaining = Number(rawRemaining), resetSeconds = Number(rawReset);
  if (limit < 1 || remaining > limit || !Number.isSafeInteger(resetSeconds) || resetSeconds > 86_400)
    return block("QUOTA_UNAVAILABLE", evidence);
  if (remaining <= 5) return block("QUOTA_LOW");
  return { limit, remaining, resetSeconds };
}

export function assertReadOnlyProbeGates(config: Record<string, string | undefined>) {
  for (const key of [
    "GROWTH_WORKER_RUN_ENABLED", "GROWTH_DAILY_REPORT_SCHEDULE_ENABLED",
    "TELEGRAM_REPORTS_ENABLED", "GROWTH_ATTRIBUTION_COLLECTION_ENABLED",
  ]) if (config[key] === "true") block("GROWTH_NOT_OFF");
  if (config.GROWTH_ROLLOUT_MODE === "OBSERVE" || config.GROWTH_ROLLOUT_MODE === "RECOMMEND")
    block("GROWTH_NOT_OFF");
}

/**
 * One official Pinterest GET, without the normal token refresher: no DB writes,
 * no OAuth refresh, no state mutation, no retries, and never print identities or credentials.
 */
export async function runPinterestQuotaProbe(fetchImpl: typeof fetch = fetch) {
  const expected = process.env.EXPECTED_RELEASE || "";
  if (!/^[a-f0-9]{40}$/.test(expected) ||
      readFileSync(".deployed-release", "utf8").trim() !== expected) block("RELEASE_MISMATCH");
  assertReadOnlyProbeGates(process.env);
  const rawUrl = process.env.DATABASE_URL || "";
  let database: URL;
  try { database = new URL(rawUrl); } catch { return block("ENV_NOT_READY"); }
  if (!["postgres:", "postgresql:"].includes(database.protocol) ||
      database.hostname !== "127.0.0.1" || database.port !== "5433" ||
      decodeURIComponent(database.pathname.slice(1)) !== "saytwist" ||
      database.searchParams.has("host")) block("ENV_NOT_READY");

  const [settings, running, accounts] = await Promise.all([
    prisma.growthSettings.findUnique({ where: { id: "global" }, select: { enabled: true, attributionEnabled: true } }),
    prisma.growthJob.count({ where: { status: { in: ["PENDING", "CLAIMED", "RUNNING", "FAILED_RETRYABLE"] } } }),
    prisma.growthPinterestAccount.findMany({
      where: { connectionStatus: GrowthPinterestConnectionStatus.CONNECTED,
        apiEnvironment: GrowthPinterestApiEnvironment.PRODUCTION },
      select: { pinterestAccountId: true, grantedScopes: true, encryptedCredentials: true,
        accessTokenExpiresAt: true, refreshTokenExpiresAt: true },
      take: 2,
    }),
  ]);
  if (!settings || settings.enabled || settings.attributionEnabled) block("GROWTH_NOT_OFF");
  if (running !== 0) block("QUEUE_NOT_IDLE");
  if (accounts.length !== 1 || !accounts[0].encryptedCredentials ||
      !accounts[0].grantedScopes.includes("user_accounts:read")) block("ACCOUNT_NOT_READY");
  const account = accounts[0];
  if (!account.encryptedCredentials) block("ACCOUNT_NOT_READY");
  const now = Date.now();
  if (!account.accessTokenExpiresAt || account.accessTokenExpiresAt.getTime() - now < 300_000 ||
      (account.refreshTokenExpiresAt && account.refreshTokenExpiresAt.getTime() <= now))
    block("TOKEN_NOT_READY");
  const config = requirePinterestConfiguration();
  if (config.apiEnvironment !== GrowthPinterestApiEnvironment.PRODUCTION ||
      config.apiBaseUrl !== "https://api.pinterest.com/v5") block("ENV_NOT_READY");
  const creds = decryptPinterestCredentials(account.encryptedCredentials);
  let response: Response;
  try {
    response = await fetchImpl("https://api.pinterest.com/v5/user_account", {
      method: "GET", redirect: "error",
      headers: { Authorization: `Bearer ${creds.accessToken}`, Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
  } catch { return block("PINTEREST_HTTP_FAILURE"); }
  if (!response.ok) block("PINTEREST_HTTP_FAILURE");
  const quota = assessPinterestQuota(response.headers);
  // Do not log provider body, account ID or username.
  const body: unknown = await response.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body) ||
      (body as { id?: unknown }).id !== account.pinterestAccountId) block("UNEXPECTED_RESPONSE");
  return {
    status: "QUOTA_PROBE_PASSED" as const,
    limit: quota.limit, remaining: quota.remaining, resetSeconds: quota.resetSeconds,
    providerCalls: 1, providerWrites: 0, databaseWrites: 0, telegramMessages: 0, aiCalls: 0,
  };
}
