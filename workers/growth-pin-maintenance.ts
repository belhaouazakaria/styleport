import { readFileSync } from "node:fs";
import os from "node:os";
import { GrowthActivityActorKind, GrowthJobType, GrowthPinterestApiEnvironment, GrowthPinterestConnectionStatus, Prisma } from "@prisma/client";
import { recordGrowthActivity } from "@/lib/growth/activity";
import { countBlockingGrowthJobs } from "@/lib/growth/operations/approved-publication-queue";
import { syncPinterestPinAnalytics, syncPinterestPinInventory } from "@/lib/growth/pinterest/analytics";
import { assertScheduledPinterestAccounts, chooseLeastRecentlyServed,
  isScheduledPinterestAccountReady, latestMaintenanceActivity,
} from "@/lib/growth/pinterest/scheduled-account-selection";
import { prisma } from "@/lib/prisma";
import { completedUtcAnalyticsWindow } from "./growth-daily-account-analytics";

const APP = "/home/saytwist/htdocs/saytwist.com";
const NODE = "/home/saytwist/.nvm/versions/node/v24.20.0/bin/node";
const HOURS = [10, 12, 14, 16, 18, 20, 22] as const;
const INVENTORY_AGE_MS = 24 * 60 * 60_000;
const HOUR_MS = 60 * 60_000;
const DAY_MS = 24 * HOUR_MS;
export function assertPinMaintenanceRuntime(
  env: Record<string, string | undefined>, deployed: string,
  identity: { username: string; uid: number; cwd: string; node: string },
  now = new Date(),
) {
  const sha = env.EXPECTED_RELEASE || "";
  if (!/^[a-f0-9]{40}$/.test(sha) || sha !== deployed ||
      env.NODE_ENV !== "production" ||
      env.GROWTH_PIN_MAINTENANCE_ENTRYPOINT !== "true" ||
      env.GROWTH_PIN_MAINTENANCE_ENABLED !== "true" ||
      env.GROWTH_PIN_MAINTENANCE_APPROVAL !== "SAYTWIST_PIN_MAINTENANCE:" + sha ||
      env.GROWTH_PIN_MAINTENANCE_DAY !== now.toISOString().slice(0, 10) ||
      !HOURS.includes(now.getUTCHours() as typeof HOURS[number]) ||
      now.getUTCMinutes() < 45 || now.getUTCMinutes() >= 55) {
    throw Error("PIN_MAINTENANCE_RUNTIME_INVALID");
  }
  if (identity.username !== "saytwist" || identity.uid === 0 ||
      identity.cwd !== APP || identity.node !== NODE) {
    throw Error("PIN_MAINTENANCE_IDENTITY_INVALID");
  }
  for (const flag of ["GROWTH_WORKER_RUN_ENABLED", "GROWTH_DAILY_REPORT_SCHEDULE_ENABLED",
    "TELEGRAM_REPORTS_ENABLED", "GROWTH_ATTRIBUTION_COLLECTION_ENABLED",
    "GROWTH_AI_IMAGE_ENABLED", "GROWTH_DAILY_ANALYTICS_SCOPE"]) {
    if (env[flag] !== "false") throw Error("PIN_MAINTENANCE_UNSAFE_FLAGS");
  }
  if (env.GROWTH_ROLLOUT_MODE !== "OFF" ||
      env.GROWTH_PIN_MAINTENANCE_SCOPE !== "false" ||
      env.PINTEREST_API_ENVIRONMENT !== "production" ||
      env.APP_BASE_URL !== "https://saytwist.com") throw Error("PIN_MAINTENANCE_ENV_INVALID");
  let db: URL;
  try { db = new URL(env.DATABASE_URL || ""); }
  catch { throw Error("PIN_MAINTENANCE_DATABASE_INVALID"); }
  if (!["postgres:", "postgresql:"].includes(db.protocol) ||
      db.hostname !== "127.0.0.1" || db.port !== "5433" ||
      decodeURIComponent(db.pathname.slice(1)) !== "saytwist" ||
      db.searchParams.has("host") || !db.username) {
    throw Error("PIN_MAINTENANCE_DATABASE_INVALID");
  }
  return { sha, day: now.toISOString().slice(0, 10), hour: now.getUTCHours() };
}

export function chooseMaintenanceKind(state: {
  inventoryStartedAt: Date | null; inventoryBookmark: string | null;
  lastInventorySyncAt: Date | null;
}, eligible: number, now: Date) {
  if (state.inventoryStartedAt || state.inventoryBookmark ||
      !state.lastInventorySyncAt ||
      now.getTime() - state.lastInventorySyncAt.getTime() >= INVENTORY_AGE_MS) {
    return GrowthJobType.PINTEREST_PIN_INVENTORY_SYNC;
  }
  return eligible > 0 ? GrowthJobType.PINTEREST_PIN_ANALYTICS_SYNC : null;
}

/** Fail-closed, one scoped job per permitted UTC slot. No generic queue sweep.
 * Publisher and account analytics retain headroom under the 4/hour, 16/day
 * shared durable Pinterest transport budget.
 */
export async function runBoundedPinMaintenance(now = new Date()) {
  if (!Number.isFinite(now.getTime()) ||
      !HOURS.includes(now.getUTCHours() as typeof HOURS[number]) ||
      now.getUTCMinutes() < 45 || now.getUTCMinutes() >= 55) {
    throw Error("MAINTENANCE_WINDOW_INVALID");
  }
  const key = "growth-pin-maintenance-v1:" + now.toISOString().slice(0, 13).replace("T", ":");
  // A 7-day response cannot recover the 14-day observation requirement
  // on a Pin that has not been refreshed for weeks. A 28-day response
  // stays inside Pinterest's 90-day window without using additional GETs.
  const range = completedUtcAnalyticsWindow(now.toISOString().slice(0, 10), 28);
  const admission = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "GrowthSettings"
      WHERE "id" = 'global' FOR UPDATE`;
    const settings = await tx.growthSettings.findUnique({
      where: { id: "global" },
      select: { enabled: true, attributionEnabled: true, workerActivationExpiresAt: true },
    });
    if (!settings || settings.enabled || settings.attributionEnabled ||
        settings.workerActivationExpiresAt !== null ||
        await countBlockingGrowthJobs(tx) !== 0) {
      return { status: "SKIPPED_BUSY" as const };
    }
    const accounts = await tx.growthPinterestAccount.findMany({
      where: { apiEnvironment: GrowthPinterestApiEnvironment.PRODUCTION,
        connectionStatus: GrowthPinterestConnectionStatus.CONNECTED },
      select: { id: true, activeRole: true, encryptedCredentials: true, grantedScopes: true,
        accessTokenExpiresAt: true, refreshTokenExpiresAt: true }, take: 4,
    });
    // Never broaden past the three explicitly assigned production roles.
    assertScheduledPinterestAccounts(accounts);
    const candidates: Array<{
      account: typeof accounts[number]; kind: GrowthJobType;
      lastServedAt: Date | null; inventoryIncomplete: boolean;
    }> = [];
    let readyAccounts = 0;
    for (const account of accounts) {
      if (!isScheduledPinterestAccountReady(account,
        ["pins:read", "user_accounts:read"], now, 20 * 60_000)) continue;
      readyAccounts++;
      // A recently connected account has not yet completed board/inventory
      // onboarding. Do not spend its only GET before that setup is complete.
      const state = await tx.growthPinterestAnalyticsState.findUnique({
        where: { accountId: account.id },
        select: { inventoryStartedAt: true, inventoryBookmark: true,
          lastInventorySyncAt: true, lastPinAnalyticsSyncAt: true },
      });
      if (!state) continue;
      const eligible = await tx.growthPinterestPin.count({
        where: { accountId: account.id, isActive: true, analyticsEligible: true },
      });
      const kind = chooseMaintenanceKind(state, eligible, now);
      if (!kind) continue;
      candidates.push({ account, kind,
        lastServedAt: latestMaintenanceActivity(
          state.lastInventorySyncAt, state.lastPinAnalyticsSyncAt),
        inventoryIncomplete: Boolean(state.inventoryStartedAt || state.inventoryBookmark),
      });
    }
    if (!readyAccounts) throw Error("PIN_MAINTENANCE_ACCOUNT_NOT_READY");
    // Continue an in-progress inventory walk before starting another page.
    // Otherwise, rotate the single GET toward the least recently served role.
    const pendingInventory = candidates.filter(c => c.inventoryIncomplete);
    const pool = pendingInventory.length ? pendingInventory : candidates;
    const account = chooseLeastRecentlyServed(pool.map(c => ({
      account: c.account, lastServedAt: c.lastServedAt,
    })));
    if (!account) return { status: "SKIPPED_NO_PINS" as const };
    const selected = pool.find(c => c.account.id === account.id)!.kind;
    // Durable slot reservation is committed before network access. If the
    // process crashes, the slot is not retried and NO GrowthJob is stranded.
    const previous = await tx.growthActivity.count({
      where: { entityType: "GrowthPinterestAccount",
        action: "PIN_MAINTENANCE_SLOT_RESERVED", correlationKey: key },
    });
    if (previous !== 0) return { status: "ALREADY_ATTEMPTED" as const };
    const where = { entityType: "GrowthPinterestProviderBudget",
      entityId: "production-global", action: "PINTEREST_GLOBAL_API_REQUEST_RESERVED" };
    const [hourly, daily] = await Promise.all([
      tx.growthActivity.count({ where: { ...where,
        createdAt: { gte: new Date(now.getTime() - HOUR_MS) } } }),
      tx.growthActivity.count({ where: { ...where,
        createdAt: { gte: new Date(now.getTime() - DAY_MS) } } }),
    ]);
    // Leave ample reserved request headroom for publisher, daily analytics
    // and the approved daily observer; global budget remains authoritative.
    if (hourly >= 2 || daily >= 10) return { status: "SKIPPED_BUDGET" as const };
    await recordGrowthActivity({
      actorKind: GrowthActivityActorKind.SYSTEM,
      entityType: "GrowthPinterestAccount", entityId: account.id,
      action: "PIN_MAINTENANCE_SLOT_RESERVED", correlationKey: key,
      summary: { jobType: selected, maxRequests: 1, noQueue: true },
    }, tx);
    return { status: "ADMITTED" as const, accountId: account.id, kind: selected };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 12_000 });
  if (admission.status !== "ADMITTED") {
    return { status: admission.status, growth: "OFF", providerGetsMax: 0 } as const;
  }
  const params = { accountId: admission.accountId, ...range,
    runStartedAt: now.toISOString(), maintenanceBounded: true };
  if (admission.kind === GrowthJobType.PINTEREST_PIN_INVENTORY_SYNC) {
    await syncPinterestPinInventory(params);
  } else {
    await syncPinterestPinAnalytics({ ...params, batch: 0, relevancePrepared: true });
  }
  await recordGrowthActivity({
    actorKind: GrowthActivityActorKind.SYSTEM,
    entityType: "GrowthPinterestAccount", entityId: admission.accountId,
    action: "PIN_MAINTENANCE_COMPLETED", correlationKey: key,
    summary: { jobType: admission.kind, maxRequests: 1, noQueue: true },
  });
  const [settings, blocking] = await Promise.all([
    prisma.growthSettings.findUnique({ where: { id: "global" },
      select: { enabled: true, attributionEnabled: true, workerActivationExpiresAt: true } }),
    countBlockingGrowthJobs(prisma),
  ]);
  if (!settings || settings.enabled || settings.attributionEnabled ||
      settings.workerActivationExpiresAt !== null || blocking !== 0) {
    throw Error("PIN_MAINTENANCE_POSTCONDITION_FAILED");
  }
  return { status: admission.kind === GrowthJobType.PINTEREST_PIN_INVENTORY_SYNC
    ? "INVENTORY_SUCCEEDED" : "PIN_SUCCEEDED",
    growth: "OFF", providerGetsMax: 1 } as const;
}

async function main() {
  try {
    const now = new Date();
    assertPinMaintenanceRuntime(process.env, readFileSync(".deployed-release", "utf8").trim(), {
      username: os.userInfo().username, uid: process.getuid?.() ?? -1,
      cwd: process.cwd(), node: process.execPath,
    }, now);
    const result = await runBoundedPinMaintenance(now);
    console.log("GROWTH_PIN_MAINTENANCE=" + result.status);
    console.log("GROWTH_PIN_MAINTENANCE_GROWTH=" + result.growth);
    console.log("GROWTH_PIN_MAINTENANCE_PROVIDER_GET_MAX=" + result.providerGetsMax);
    console.log("GROWTH_PIN_MAINTENANCE_PROVIDER_WRITES=0");
    console.log("GROWTH_PIN_MAINTENANCE_AI_CALLS=0");
  } catch {
    console.error("GROWTH_PIN_MAINTENANCE=BLOCKED");
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect().catch(() => { process.exitCode = 1; });
  }
}
if (process.env.GROWTH_PIN_MAINTENANCE_ENTRYPOINT === "true") void main();
