import { readFileSync } from "node:fs";
import os from "node:os";
import { GrowthActivityActorKind, GrowthJobStatus, GrowthJobType,
  GrowthPinterestApiEnvironment, GrowthPinterestConnectionStatus, Prisma } from "@prisma/client";

import { recordGrowthActivity } from "@/lib/growth/activity";
import { reserveOneAccountSyncRequest } from "@/lib/growth/pinterest/one-sync-guard";
import { prisma } from "@/lib/prisma";
import { revokeGrowthWorkerActivation } from "@/lib/growth/settings";
import { runGrowthWorker } from "@/lib/growth/worker";

const APP = "/home/saytwist/htdocs/saytwist.com";
const NODE = "/home/saytwist/.nvm/versions/node/v24.20.0/bin/node";
const LEASE_MS = 120_000;
const ACTIVE = [GrowthJobStatus.PENDING, GrowthJobStatus.CLAIMED,
  GrowthJobStatus.RUNNING, GrowthJobStatus.FAILED_RETRYABLE];
const ROLLOUT = { GROWTH_WORKER_RUN_ENABLED: "true", GROWTH_ROLLOUT_MODE: "OBSERVE" };

export function assertOneSyncRuntime(
  env: Record<string, string | undefined>, deployed: string,
  identity: { username: string; uid: number; cwd: string; node: string },
) {
  const sha = env.EXPECTED_RELEASE || "";
  if (!/^[a-f0-9]{40}$/.test(sha) || sha !== deployed ||
      env.GROWTH_PINTEREST_ONE_SYNC_APPROVAL !== "RUN SAYTWIST GROWTH ONE ACCOUNT SYNC " + sha ||
      env.NODE_ENV !== "production") throw Error("RELEASE_OR_APPROVAL");
  if (identity.username !== "saytwist" || identity.uid === 0 ||
      identity.cwd !== APP || identity.node !== NODE) throw Error("HOST_IDENTITY");
  for (const flag of ["GROWTH_WORKER_RUN_ENABLED",
    "GROWTH_DAILY_REPORT_SCHEDULE_ENABLED", "TELEGRAM_REPORTS_ENABLED",
    "GROWTH_ATTRIBUTION_COLLECTION_ENABLED"]) {
    if (env[flag] === "true") throw Error("AUTOMATION_NOT_OFF");
  }
  if (["OBSERVE", "RECOMMEND"].includes(env.GROWTH_ROLLOUT_MODE || "")) {
    throw Error("ROLLOUT_NOT_OFF");
  }
  let url: URL;
  try { url = new URL(env.DATABASE_URL || ""); }
  catch { throw Error("DB_TARGET"); }
  if (!["postgres:", "postgresql:"].includes(url.protocol) ||
      url.hostname !== "127.0.0.1" || url.port !== "5433" ||
      decodeURIComponent(url.pathname.slice(1)) !== "saytwist" ||
      url.searchParams.has("host") || !url.username) throw Error("DB_TARGET");
  return sha;
}

export async function runOneAccountSync(sha: string) {
  if (!/^[a-f0-9]{40}$/.test(sha)) throw Error("RELEASE_INVALID");
  const now = new Date();
  const expiry = new Date(now.getTime() + LEASE_MS);
  const key = "growth-one-account-sync:" + sha;
  let admitted = false;
  let jobId: string | undefined;
  let accountId: string | undefined;
  try {
    const admission = await prisma.$transaction(async tx => {
      const [settings, activeCount, accounts] = await Promise.all([
        tx.growthSettings.findUnique({ where: { id: "global" },
          select: { enabled: true, attributionEnabled: true, workerActivationExpiresAt: true } }),
        tx.growthJob.count({ where: { status: { in: ACTIVE } } }),
        tx.growthPinterestAccount.findMany({ where: {
          apiEnvironment: GrowthPinterestApiEnvironment.PRODUCTION,
          connectionStatus: GrowthPinterestConnectionStatus.CONNECTED,
        }, select: { id: true, encryptedCredentials: true,
          grantedScopes: true, accessTokenExpiresAt: true,
          refreshTokenExpiresAt: true }, take: 2 }),
      ]);
      if (!settings || settings.enabled || settings.attributionEnabled ||
          settings.workerActivationExpiresAt !== null || activeCount !== 0 ||
          accounts.length !== 1) throw Error("ADMISSION_NOT_IDLE");
      const account = accounts[0];
      if (!account.encryptedCredentials || !account.grantedScopes.includes("user_accounts:read") ||
          !account.accessTokenExpiresAt ||
          account.accessTokenExpiresAt.getTime() - now.getTime() < 15 * 60_000 ||
          (account.refreshTokenExpiresAt && account.refreshTokenExpiresAt <= now)) {
        throw Error("PINTEREST_ACCOUNT_NOT_READY");
      }
      // This durable reservation is committed with activation before the provider GET.
      await reserveOneAccountSyncRequest(tx, account.id, key, now);
      const enabled = await tx.growthSettings.updateMany({
        where: { id: "global", enabled: false, attributionEnabled: false,
          workerActivationExpiresAt: null },
        data: { enabled: true, workerActivationExpiresAt: expiry,
          configVersion: { increment: 1 } },
      });
      if (enabled.count !== 1) throw Error("ADMISSION_RACE");
      const job = await tx.growthJob.create({ data: {
        type: GrowthJobType.PINTEREST_ACCOUNT_SYNC, idempotencyKey: key,
        payload: { accountId: account.id }, maxAttempts: 1,
      }, select: { id: true } });
      await recordGrowthActivity({
        actorKind: GrowthActivityActorKind.SYSTEM,
        entityType: "GrowthSettings", entityId: "global",
        action: "WORKER_ACTIVATION_ONE_PINTEREST_ACCOUNT_SYNC",
        fromState: "DISABLED", toState: "ENABLED",
        summary: { type: "PINTEREST_ACCOUNT_SYNC", maxCalls: 1, deadline: expiry },
        correlationKey: key,
      }, tx);
      return { jobId: job.id, accountId: account.id };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 12_000 });
    admitted = true;
    jobId = admission.jobId;
    accountId = admission.accountId;
    // The only network-capable handler in this one-shot process checks this ID
    // and its local one-GET allowance before every request.
    process.env.GROWTH_PINTEREST_ONE_SYNC_JOB_ID = jobId;
    const outcome = await runGrowthWorker({
      onlyJobId: jobId, batchSize: 1, workerId: "phase14e-one-account-sync",
      rolloutConfig: ROLLOUT,
    });
    if (outcome.status !== "COMPLETED" || outcome.claimed !== 1 ||
        outcome.succeeded !== 1 || outcome.failed !== 0) throw Error("JOB_NOT_SUCCEEDED");
  } finally {
    delete process.env.GROWTH_PINTEREST_ONE_SYNC_JOB_ID;
    if (admitted) await revokeGrowthWorkerActivation(expiry);
  }
  const [settings, job, account, active] = await Promise.all([
    prisma.growthSettings.findUnique({ where: { id: "global" },
      select: { enabled: true, attributionEnabled: true, workerActivationExpiresAt: true } }),
    prisma.growthJob.findUnique({ where: { id: jobId! }, select: { type: true, status: true } }),
    prisma.growthPinterestAccount.findUnique({ where: { id: accountId! },
      select: { lastAccountSyncAt: true, lastSuccessfulApiCallAt: true } }),
    prisma.growthJob.count({ where: { status: { in: ACTIVE } } }),
  ]);
  if (!settings || settings.enabled || settings.attributionEnabled ||
      settings.workerActivationExpiresAt !== null ||
      job?.type !== GrowthJobType.PINTEREST_ACCOUNT_SYNC ||
      job?.status !== GrowthJobStatus.SUCCEEDED ||
      !account?.lastAccountSyncAt || account.lastAccountSyncAt < now ||
      !account.lastSuccessfulApiCallAt || account.lastSuccessfulApiCallAt < now ||
      active !== 0) throw Error("POSTCONDITION_FAILED");
  return { job: "SUCCEEDED", growth: "OFF", lease: "NONE",
    activeQueue: 0, providerGets: 1, providerWrites: 0, aiCalls: 0, telegram: 0 } as const;
}

async function main() {
  let stage = "RUNTIME";
  try {
    const sha = assertOneSyncRuntime(process.env,
      readFileSync(".deployed-release", "utf8").trim(), {
        username: os.userInfo().username, uid: process.getuid?.() ?? -1,
        cwd: process.cwd(), node: process.execPath,
      });
    stage = "ONE_SYNC";
    const result = await runOneAccountSync(sha);
    console.log("GROWTH_ONE_ACCOUNT_SYNC=PASSED");
    console.log("GROWTH_ONE_ACCOUNT_SYNC_JOB=" + result.job);
    console.log("GROWTH_ONE_ACCOUNT_SYNC_GROWTH=" + result.growth);
    console.log("GROWTH_ONE_ACCOUNT_SYNC_LEASE=" + result.lease);
    console.log("GROWTH_ONE_ACCOUNT_SYNC_ACTIVE_QUEUE=" + result.activeQueue);
    console.log("GROWTH_ONE_ACCOUNT_SYNC_PROVIDER_GETS=" + result.providerGets);
    console.log("GROWTH_ONE_ACCOUNT_SYNC_PROVIDER_WRITES=" + result.providerWrites);
    console.log("GROWTH_ONE_ACCOUNT_SYNC_AI_CALLS=" + result.aiCalls);
    console.log("GROWTH_ONE_ACCOUNT_SYNC_TELEGRAM=" + result.telegram);
  } catch {
    console.error("GROWTH_ONE_ACCOUNT_SYNC=BLOCKED");
    console.error("GROWTH_ONE_ACCOUNT_SYNC_STAGE=" + stage);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect().catch(() => { process.exitCode = 1; });
  }
}
if (process.env.GROWTH_PINTEREST_ONE_SYNC_ENTRYPOINT === "true") void main();
