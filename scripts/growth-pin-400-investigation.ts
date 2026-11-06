import { readFileSync } from "node:fs";
import os from "node:os";
import {
  GrowthActivityActorKind,
  GrowthJobStatus,
  GrowthJobType,
  GrowthPinApprovalStatus,
  GrowthPublicationStatus,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { recordGrowthActivity } from "@/lib/growth/activity";
import {
  claimGrowthJobs, markGrowthJobRunning,
  completeGrowthJob, failGrowthJob,
} from "@/lib/growth/jobs";
import { revokeGrowthWorkerActivation } from "@/lib/growth/settings";
import { publishApprovedPin } from "@/lib/growth/publishing/service";

const RELEASE = "1f7f0560661a86947c3ce7c49c7a4669d41736f2";
const APP = "/home/saytwist/htdocs/saytwist.com";
const NODE = "/home/saytwist/.nvm/versions/node/v24.20.0/bin/node";
const FLIRTY = "cmw5gct1u0015a5ajt0gg6gza";
const SLOTS = [
  { label: "COLD_HEARTED", candidateId: "cmw5gcsxc000pa5aju6j8g8uv", date: "2026-11-06T21:10:00.000Z" },
  { label: "JESTER", candidateId: "cmw5gcss30009a5ajv9pzwebg", date: "2026-11-06T21:15:00.000Z" },
] as const;
const ACTIVE = [GrowthJobStatus.PENDING, GrowthJobStatus.CLAIMED,
  GrowthJobStatus.RUNNING, GrowthJobStatus.FAILED_RETRYABLE];

function assertHost() {
  const source = process.env.PIN_400_SOURCE_SHA || "";
  if (!/^[a-f0-9]{40}$/.test(source) ||
      process.env.PIN_400_RELEASE_SHA !== RELEASE ||
      process.env.PIN_400_ENTRYPOINT !== "true" ||
      process.env.PIN_400_OWNER_APPROVAL !==
        "RUN SAYTWIST PIN 400 DIAGNOSTIC " + source + ":" + RELEASE ||
      process.env.NODE_ENV !== "production" ||
      process.env.GROWTH_WORKER_RUN_ENABLED !== "false" ||
      process.env.GROWTH_ROLLOUT_MODE !== "OFF" ||
      process.env.GROWTH_AI_IMAGE_ENABLED !== "false" ||
      process.env.GROWTH_ATTRIBUTION_COLLECTION_ENABLED !== "false" ||
      process.execPath !== NODE ||
      process.cwd() !== APP ||
      os.userInfo().username !== "saytwist" ||
      process.getuid?.() === 0 ||
      readFileSync(APP + "/.deployed-release", "utf8").trim() !== RELEASE ||
      readFileSync(APP + "/.growth-pin-400/" + source + "/.source-sha", "utf8").trim() !== source) {
    throw Error("HOST_IDENTITY_INVALID");
  }
  const db = new URL(process.env.DATABASE_URL || "");
  if (!["postgres:", "postgresql:"].includes(db.protocol) ||
      db.hostname !== "127.0.0.1" || db.port !== "5433" ||
      decodeURIComponent(db.pathname.slice(1)) !== "saytwist" ||
      db.searchParams.has("host") || !db.username ||
      process.env.PINTEREST_API_ENVIRONMENT !== "production" ||
      ["PINTEREST_APP_ID", "PINTEREST_APP_SECRET", "PINTEREST_REDIRECT_URI",
        "GROWTH_CREDENTIAL_ENCRYPTION_KEY"].some(k => !process.env[k])) {
    throw Error("PRODUCTION_TARGET_INVALID");
  }
  if (process.env.APP_BASE_URL !== "https://saytwist.com") throw Error("URL_ORIGIN_INVALID");
}

async function checkApproved() {
  const now = new Date();
  const [settings, rows, flirty, globalCallsHour, globalCallsDay, cooldown] = await Promise.all([
    prisma.growthSettings.findUnique({ where: { id: "global" },
      select: { enabled: true, attributionEnabled: true, workerActivationExpiresAt: true } }),
    Promise.all(SLOTS.map(x => prisma.growthPinPublication.findMany({
      where: { candidateId: x.candidateId, status: GrowthPublicationStatus.SCHEDULED },
      include: {
        approval: true, publishJob: true,
        board: true, account: true,
        candidate: { include: { asset: true } },
      },
    }))),
    prisma.growthPinPublication.findFirst({
      where: { candidateId: FLIRTY },
      include: { publishJob: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.growthActivity.count({ where: {
      entityType: "GrowthPinterestProviderBudget",
      entityId: "production-global",
      action: "PINTEREST_GLOBAL_API_REQUEST_RESERVED",
      createdAt: { gte: new Date(now.getTime() - 3_600_000) },
    } }),
    prisma.growthActivity.count({ where: {
      entityType: "GrowthPinterestProviderBudget",
      entityId: "production-global",
      action: "PINTEREST_GLOBAL_API_REQUEST_RESERVED",
      createdAt: { gte: new Date(now.getTime() - 86_400_000) },
    } }),
    prisma.growthActivity.count({ where: {
      entityType: "GrowthPinterestProviderBudget",
      entityId: "production-global",
      action: "PINTEREST_GLOBAL_API_COOLDOWN",
      createdAt: { gte: new Date(now.getTime() - 3_600_000) },
    } }),
  ]);
  if (!settings || settings.enabled || settings.attributionEnabled ||
      settings.workerActivationExpiresAt !== null) throw Error("GROWTH_NOT_IDLE");
  if (!flirty || flirty.status !== GrowthPublicationStatus.FAILED_TERMINAL ||
      flirty.lastErrorCode !== "PINTEREST_CREATE_REJECTED" ||
      !flirty.publishJob || flirty.publishJob.type !== GrowthJobType.PINTEREST_PIN_PUBLISH ||
      flirty.publishJob.status !== GrowthJobStatus.FAILED_RETRYABLE ||
      flirty.publishJob.attemptCount !== 1 ||
      flirty.publishJob.workerId === null && flirty.publishJob.leaseUntil !== null) {
    throw Error("FLIRTY_TERMINAL_PAIR_CHANGED");
  }
  const pair = rows.map((items, index) => {
    const spec = SLOTS[index];
    if (items.length !== 1) throw Error("APPROVAL_CARDINALITY");
    const row = items[0];
    if (row.candidateId !== spec.candidateId ||
        row.scheduledAt.toISOString() !== spec.date ||
        row.scheduledAt.getTime() > now.getTime() ||
        now.getTime() > Date.parse(spec.date) + 86_400_000 ||
        row.approval.status !== GrowthPinApprovalStatus.APPROVED ||
        !row.approval.approvedById ||
        row.approval.candidateId !== spec.candidateId ||
        row.approval.scheduledAt?.toISOString() !== spec.date ||
        row.approval.candidateRevision !== row.candidate.revision ||
        row.account.connectionStatus !== "CONNECTED" ||
        row.account.apiEnvironment !== "PRODUCTION" ||
        !["pins:read", "pins:write", "boards:read", "boards:write"].every(s =>
          row.account.grantedScopes.includes(s)) ||
        !row.account.encryptedCredentials ||
        !row.account.accessTokenExpiresAt ||
        row.account.accessTokenExpiresAt.getTime() < now.getTime() + 20 * 60_000 ||
        !row.board.isActive || row.board.accountId !== row.accountId ||
        row.candidate.status !== "READY" ||
        row.candidate.asset.mimeType !== "image/png" ||
        row.candidate.asset.width !== 1000 ||
        row.candidate.asset.height !== 1500 ||
        !row.publishJob || row.publishJob.type !== GrowthJobType.PINTEREST_PIN_PUBLISH ||
        row.publishJob.status !== GrowthJobStatus.PENDING ||
        row.publishJob.attemptCount !== 0 ||
        row.publishJob.idempotencyKey !== row.idempotencyKey ||
        row.idempotencyKey !== "pinterest-publish:" + row.id ||
        row.publishJob.runAfter.toISOString() !== spec.date ||
        (row.publishJob.payload as { publicationId?: unknown })?.publicationId !== row.id) {
      throw Error("APPROVAL_SCHEDULE_OR_JOB_CHANGED");
    }
    return row;
  });
  const allowed = [...pair.map(row => row.publishJob!.id), flirty.publishJob.id];
  if (new Set(allowed).size !== 3) throw Error("JOB_COLLISION");
  const others = await prisma.growthJob.count({
    where: { status: { in: ACTIVE }, id: { notIn: allowed } },
  });
  if (others !== 0) throw Error("OTHER_ACTIVE_JOB");
  if (globalCallsHour > 2 || globalCallsDay > 14 || cooldown !== 0) {
    throw Error("PINTEREST_QUOTA_NOT_ADMISSIBLE");
  }
  return { pair, flirtyJobId: flirty.publishJob.id };
}

async function retireOnlyRejectedFlirty(jobId: string) {
  await prisma.$transaction(async tx => {
    const flirty = await tx.growthPinPublication.findFirst({
      where: { candidateId: FLIRTY }, orderBy: { createdAt: "desc" },
      select: { id: true, status: true, lastErrorCode: true, publishJobId: true },
    });
    if (!flirty ||
        flirty.status !== GrowthPublicationStatus.FAILED_TERMINAL ||
        flirty.lastErrorCode !== "PINTEREST_CREATE_REJECTED" ||
        flirty.publishJobId !== jobId) throw Error("REPAIR_NOT_AUTHORIZED");
    const changed = await tx.growthJob.updateMany({
      where: {
        id: jobId, type: GrowthJobType.PINTEREST_PIN_PUBLISH,
        status: GrowthJobStatus.FAILED_RETRYABLE, attemptCount: 1,
      },
      data: {
        status: GrowthJobStatus.FAILED_TERMINAL,
        completedAt: new Date(), workerId: null, leaseUntil: null,
        heartbeatAt: new Date(), lastError: "Pinterest explicitly rejected Create Pin with HTTP 400.",
      },
    });
    if (changed.count !== 1) throw Error("REPAIR_RACE");
    await recordGrowthActivity({
      actorKind: GrowthActivityActorKind.SYSTEM,
      entityType: "GrowthJob", entityId: jobId,
      action: "JOB_FAILED_TERMINAL",
      fromState: GrowthJobStatus.FAILED_RETRYABLE,
      toState: GrowthJobStatus.FAILED_TERMINAL,
      summary: { reason: "PUBLICATION_ALREADY_TERMINAL_HTTP_400", providerRequests: 0 },
      correlationKey: "pin-400-repair:" + jobId,
    }, tx);
  });
  console.log("PIN_400_ORPHAN_JOB=RETIRED");
}

function safeMessage(value: unknown) {
  if (typeof value !== "string") return "UNAVAILABLE";
  return value.replace(/https?:\/\/[^\s"']+/gi, "[url]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email]")
    .replace(/\b(?:Bearer|authorization|access.token|refresh.token|client.secret)\b\s*[:=]?\s*\S+/gi, "[secret]")
    .replace(/\b[A-Za-z0-9_-]{25,}\b/g, "[id]")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ").slice(0, 240) || "EMPTY";
}

async function diagnosticFetch(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init);
  const url = typeof input === "string" ? input : input.toString();
  if (url === "https://api.pinterest.com/v5/pins" &&
      init?.method === "POST" && response.status >= 400 && response.status < 500) {
    let raw: unknown = null;
    try { raw = await response.clone().json(); } catch { /* only status is known */ }
    const object = raw && typeof raw === "object" && !Array.isArray(raw)
      ? raw as Record<string, unknown> : {};
    const code = typeof object.code === "number"
      ? String(object.code)
      : typeof object.code === "string" && /^[A-Za-z0-9_.:-]{1,80}$/.test(object.code)
        ? object.code : "UNAVAILABLE";
    console.log("PIN_400_PROVIDER_HTTP=" + response.status);
    console.log("PIN_400_PROVIDER_CODE=" + code);
    console.log("PIN_400_PROVIDER_MESSAGE=" + safeMessage(object.message));
  }
  return response;
}

async function executeApprovedPair(pair: Awaited<ReturnType<typeof checkApproved>>["pair"]) {
  const lease = new Date(Date.now() + 240_000);
  let leased = false;
  const published: string[] = [];
  try {
    const admit = await prisma.growthSettings.updateMany({
      where: { id: "global", enabled: false,
        attributionEnabled: false, workerActivationExpiresAt: null },
      data: { enabled: true, workerActivationExpiresAt: lease,
        configVersion: { increment: 1 } },
    });
    if (admit.count !== 1) throw Error("LEASE_RACE");
    leased = true;
    for (const [index, row] of pair.entries()) {
      const spec = SLOTS[index];
      if (Date.now() > lease.getTime() - 30_000) throw Error("LEASE_DEPLETED");
      const workerId = "pin-400-exact:" + row.publishJob!.id;
      const claimed = await claimGrowthJobs({
        workerId, jobId: row.publishJob!.id, limit: 1,
        allowedTypes: [GrowthJobType.PINTEREST_PIN_PUBLISH],
      });
      if (claimed.length !== 1 ||
          claimed[0].id !== row.publishJob!.id ||
          claimed[0].type !== GrowthJobType.PINTEREST_PIN_PUBLISH)
        throw Error("CLAIM_NOT_EXACT");
      const job = claimed[0];
      await markGrowthJobRunning(job, workerId);
      try {
        // Reuse deployed publication validation & Pinterest budgeted transport.
        // Only the transport is wrapped to inspect a deterministic HTTP 400.
        const result = await publishApprovedPin(row.id, diagnosticFetch);
        if (result.publication.status !== GrowthPublicationStatus.RECONCILED ||
            !result.publication.pinterestPinId) {
          throw Error("CREATE_NOT_RECONCILED");
        }
        await completeGrowthJob(job, workerId, {
          publicationId: row.id, status: result.publication.status,
          reused: result.reused,
        });
        published.push(spec.label);
        console.log("PIN_400_PUBLISHED=" + spec.label);
      } catch (error) {
        // Preserve a NonRetryableGrowthJobError's type to avoid requeueing an
        // already terminal Pinterest HTTP 400 response (the original bug).
        await failGrowthJob(job, workerId, error);
        throw Error("PIN_CREATE_FAILED");
      }
    }
  } finally {
    if (leased) await revokeGrowthWorkerActivation(lease);
  }
  console.log("PIN_400_APPROVED_PAIR=PASSED");
  console.log("PIN_400_PUBLISHED_COUNT=" + published.length);
  console.log("PIN_400_AI_CALLS=0");
}

async function main() {
  let stage = "IDENTITY";
  try {
    assertHost();
    stage = "PREFLIGHT";
    const { pair, flirtyJobId } = await checkApproved();
    console.log("PIN_400_PREFLIGHT=PASSED");
    stage = "ORPHAN_CLEANUP";
    await retireOnlyRejectedFlirty(flirtyJobId);
    stage = "PUBLISH";
    await executeApprovedPair(pair);
  } catch {
    console.error("PIN_400_BATCH=BLOCKED");
    console.error("PIN_400_STAGE=" + stage);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect().catch(() => { process.exitCode = 1; });
  }
}
void main();
