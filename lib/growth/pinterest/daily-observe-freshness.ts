import { GrowthJobStatus, GrowthJobType, GrowthPinterestApiEnvironment,
  GrowthPinterestConnectionStatus } from "@prisma/client";

import { countBlockingGrowthJobs } from "@/lib/growth/operations/approved-publication-queue";
import { prisma } from "@/lib/prisma";

const WINDOW_MS = 24 * 60 * 60_000;
const TOKEN_READINESS_MS = 15 * 60_000;
const MAX_SYNC_COMPLETION_LAG_MS = 2 * 60_000;

/**
 * Read-only evidence for the daily scheduler only. A prior request reservation
 * is NEVER treated as successful work. This recognizes only an actual
 * SUCCEEDED Pinterest account-sync job for the currently connected production
 * account, backed by matching fresh provider-success timestamps.
 *
 * Failure to prove freshness returns false, causing the existing one-GET
 * worker's durable 24h reservation to continue failing closed.
 */
export async function hasVerifiedRecentPinterestAccountSync(now = new Date()) {
  if (!Number.isFinite(now.getTime())) throw Error("DAILY_OBSERVE_DATE_INVALID");
  const since = new Date(now.getTime() - WINDOW_MS);
  const [settings, blocking, accounts] = await Promise.all([
    prisma.growthSettings.findUnique({ where: { id: "global" },
      select: { enabled: true, attributionEnabled: true,
        workerActivationExpiresAt: true } }),
    countBlockingGrowthJobs(prisma),
    prisma.growthPinterestAccount.findMany({ where: {
      apiEnvironment: GrowthPinterestApiEnvironment.PRODUCTION,
      connectionStatus: GrowthPinterestConnectionStatus.CONNECTED,
    }, select: {
      id: true, encryptedCredentials: true, grantedScopes: true,
      accessTokenExpiresAt: true, refreshTokenExpiresAt: true,
      lastAccountSyncAt: true, lastSuccessfulApiCallAt: true,
    }, take: 2 }),
  ]);
  if (!settings || settings.enabled || settings.attributionEnabled ||
      settings.workerActivationExpiresAt !== null ||
      blocking !== 0 || accounts.length !== 1) return false;
  const account = accounts[0];
  if (!account.encryptedCredentials ||
      !account.grantedScopes.includes("user_accounts:read") ||
      !account.accessTokenExpiresAt ||
      account.accessTokenExpiresAt.getTime() <= now.getTime() + TOKEN_READINESS_MS ||
      (account.refreshTokenExpiresAt && account.refreshTokenExpiresAt <= now) ||
      !account.lastAccountSyncAt || !account.lastSuccessfulApiCallAt) return false;
  const synced = account.lastAccountSyncAt.getTime();
  const called = account.lastSuccessfulApiCallAt.getTime();
  if (synced < since.getTime() || synced > now.getTime() ||
      called < since.getTime() || called > now.getTime()) return false;

  const completed = await prisma.growthJob.findFirst({
    where: {
      type: GrowthJobType.PINTEREST_ACCOUNT_SYNC,
      status: GrowthJobStatus.SUCCEEDED,
      completedAt: { gte: since, lte: now },
      payload: { path: ["accountId"], equals: account.id },
    },
    select: { completedAt: true, attemptCount: true },
    orderBy: [{ completedAt: "desc" }, { id: "asc" }],
  });
  if (!completed?.completedAt || completed.attemptCount < 1) return false;
  // The provider timestamps are written by syncPinterestAccount just before
  // completing the SAME job. They may precede the job's completedAt slightly.
  const finished = completed.completedAt.getTime();
  return Math.abs(synced - finished) <= MAX_SYNC_COMPLETION_LAG_MS &&
    Math.abs(called - finished) <= MAX_SYNC_COMPLETION_LAG_MS;
}
