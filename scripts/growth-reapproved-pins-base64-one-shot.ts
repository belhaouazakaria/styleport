import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import os from "node:os";

import {
  GrowthJobStatus, GrowthJobType, GrowthPinApprovalStatus,
  GrowthPinCandidateStatus, GrowthPublicationStatus,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  creativeAssetChecksum, resolveCreativeAssetFile, validateCreativePng,
} from "@/lib/growth/creative/storage";
import { publishApprovedPin } from "@/lib/growth/publishing/service";
import { claimGrowthJobs, markGrowthJobRunning, completeGrowthJob, failGrowthJob } from "@/lib/growth/jobs";
import { revokeGrowthWorkerActivation } from "@/lib/growth/settings";

const APP = "/home/saytwist/htdocs/saytwist.com";
const DEPLOYED = "1f7f0560661a86947c3ce7c49c7a4669d41736f2";
const NODE = "/home/saytwist/.nvm/versions/node/v24.20.0/bin/node";
const PIN_ENDPOINT = "https://api.pinterest.com/v5/pins";
const CANDIDATES = [
  { id: "cmw5gcss30009a5ajv9pzwebg", label: "JESTER" },
  { id: "cmw5gct1u0015a5ajt0gg6gza", label: "FLIRTY" },
] as const;
const ACTIVE = [GrowthJobStatus.PENDING, GrowthJobStatus.CLAIMED,
  GrowthJobStatus.RUNNING, GrowthJobStatus.FAILED_RETRYABLE];

function checkRuntime() {
  const source = process.env.PIN_BASE64_SOURCE_SHA || "";
  if (!/^[a-f0-9]{40}$/.test(source) ||
      process.env.PIN_BASE64_DEPLOYED_SHA !== DEPLOYED ||
      process.env.PIN_BASE64_ENTRYPOINT !== "true" ||
      process.env.PIN_BASE64_APPROVAL !==
        "RUN SAYTWIST REAPPROVED BASE64 PINS " + source + ":" + DEPLOYED ||
      process.env.NODE_ENV !== "production" ||
      process.env.GROWTH_WORKER_RUN_ENABLED !== "false" ||
      process.env.GROWTH_ROLLOUT_MODE !== "OFF" ||
      process.env.GROWTH_AI_IMAGE_ENABLED !== "false" ||
      process.env.GROWTH_ATTRIBUTION_COLLECTION_ENABLED !== "false" ||
      process.env.APP_BASE_URL !== "https://saytwist.com" ||
      process.execPath !== NODE || process.cwd() !== APP ||
      os.userInfo().username !== "saytwist" || process.getuid?.() === 0 ||
      readFileSync(APP + "/.deployed-release", "utf8").trim() !== DEPLOYED ||
      readFileSync(APP + "/.growth-pin-base64/" + source + "/.source-sha", "utf8").trim() !== source) {
    throw Error("RUNTIME_NOT_AUTHORIZED");
  }
  const u = new URL(process.env.DATABASE_URL || "");
  if (!["postgres:", "postgresql:"].includes(u.protocol) ||
      u.hostname !== "127.0.0.1" || u.port !== "5433" ||
      decodeURIComponent(u.pathname.slice(1)) !== "saytwist" ||
      u.searchParams.has("host") || !u.username ||
      process.env.PINTEREST_API_ENVIRONMENT !== "production" ||
      ["PINTEREST_APP_ID","PINTEREST_APP_SECRET","PINTEREST_REDIRECT_URI",
        "GROWTH_CREDENTIAL_ENCRYPTION_KEY"].some(key => !process.env[key])) {
    throw Error("PRODUCTION_TARGET_INVALID");
  }
}

type Publication = NonNullable<Awaited<ReturnType<typeof loadLatest>>>;
async function loadLatest(candidateId: string) {
  return prisma.growthPinPublication.findFirst({
    where: { candidateId },
    include: {
      approval: true,
      candidate: { include: { asset: true } },
      account: true, board: true, publishJob: true,
    },
    orderBy: [{ createdAt: "desc" }],
  });
}

function exactNewApproval(row: Publication, now: Date) {
  if (row.status !== GrowthPublicationStatus.SCHEDULED ||
      row.approval.status !== GrowthPinApprovalStatus.APPROVED ||
      !row.approval.approvedById ||
      row.approval.candidateId !== row.candidateId ||
      row.approval.candidateRevision !== row.candidate.revision ||
      row.approval.scheduledAt?.getTime() !== row.scheduledAt.getTime() ||
      row.scheduledAt.getTime() > now.getTime() ||
      now.getTime() - row.scheduledAt.getTime() > 86_400_000 ||
      row.approval.reviewedAt === null ||
      row.approval.reviewedAt.getTime() < Date.parse("2026-11-06T21:32:00.000Z") ||
      row.candidate.status !== GrowthPinCandidateStatus.READY ||
      row.candidate.asset.mimeType !== "image/png" ||
      row.candidate.asset.width !== 1000 || row.candidate.asset.height !== 1500 ||
      row.board.accountId !== row.accountId || !row.board.isActive ||
      row.account.connectionStatus !== "CONNECTED" ||
      row.account.apiEnvironment !== "PRODUCTION" ||
      !row.account.encryptedCredentials ||
      !["boards:read","boards:write","pins:read","pins:write"].every(
        s => row.account.grantedScopes.includes(s)) ||
      !row.account.accessTokenExpiresAt ||
      row.account.accessTokenExpiresAt.getTime() - now.getTime() < 20 * 60_000 ||
      row.account.refreshTokenExpiresAt && row.account.refreshTokenExpiresAt <= now ||
      !row.publishJob || row.publishJob.type !== GrowthJobType.PINTEREST_PIN_PUBLISH ||
      row.publishJob.status !== GrowthJobStatus.PENDING ||
      row.publishJob.attemptCount !== 0 ||
      row.publishJob.runAfter.getTime() !== row.scheduledAt.getTime() ||
      row.publishJob.idempotencyKey !== row.idempotencyKey ||
      row.idempotencyKey !== "pinterest-publish:" + row.id ||
      (row.publishJob.payload as { publicationId?: unknown })?.publicationId !== row.id ||
      row.publishJob.workerId || row.publishJob.leaseUntil) {
    throw Error("NEW_APPROVAL_NOT_VALID");
  }
  const snapshot = row.approval.snapshot;
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    throw Error("APPROVED_SNAPSHOT_MISSING");
  }
  const snap = snapshot as Record<string, unknown>;
  if (snap.candidateId !== row.candidateId ||
      snap.candidateRevision !== row.candidate.revision ||
      snap.assetChecksum !== row.candidate.asset.checksum ||
      typeof snap.assetPublicUrl !== "string" ||
      !/^https:\/\/saytwist\.com\/generated\/growth-creatives\/creative-[a-f0-9]{64}\.png$/.test(snap.assetPublicUrl) ||
      typeof snap.destinationUrl !== "string" ||
      !/^https:\/\/saytwist\.com\/translators\/[a-z0-9-]+\?/.test(snap.destinationUrl) ||
      snap.accountId !== row.accountId || snap.boardId !== row.boardId ||
      snap.scheduledAt !== row.scheduledAt.toISOString()) {
    throw Error("APPROVED_SNAPSHOT_INVALID");
  }
  return snap;
}

async function prepareDirectMedia(row: Publication) {
  const snapshot = exactNewApproval(row, new Date());
  const filename = row.candidate.asset.publicPath.split("/").at(-1) || "";
  const filePath = resolveCreativeAssetFile(filename);
  if (!filePath) throw Error("PNG_MANAGED_PATH_INVALID");
  const bytes = await readFile(filePath);
  validateCreativePng(bytes);
  if (creativeAssetChecksum(bytes) !== snapshot.assetChecksum) {
    throw Error("APPROVED_PNG_CHECKSUM_MISMATCH");
  }
  const base64 = bytes.toString("base64");
  const boardId = row.board.pinterestBoardId;
  const transport: typeof fetch = async (url, init) => {
    const actual = typeof url === "string" ? url : url instanceof URL ? url.href : "";
    if (actual !== PIN_ENDPOINT || init?.method !== "POST") {
      // Only the approved Pin POST is eligible to have its media substituted.
      return fetch(url, init);
    }
    if (transportCalls !== 0) throw Error("DUPLICATE_CREATE_REQUEST");
    const source = typeof init.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : null;
    if (!source || source.board_id !== boardId ||
        source.title !== snapshot.title ||
        source.description !== snapshot.description ||
        source.link !== snapshot.destinationUrl ||
        !source.media_source ||
        typeof source.media_source !== "object" ||
        Array.isArray(source.media_source)) {
      throw Error("PROVIDER_REQUEST_NOT_APPROVED");
    }
    const media = source.media_source as Record<string, unknown>;
    if (media.source_type !== "image_url" ||
        media.url !== snapshot.assetPublicUrl ||
        media.is_standard !== true) {
      throw Error("ORIGINAL_MEDIA_NOT_APPROVED");
    }
    transportCalls += 1;
    const body = JSON.stringify({
      ...source,
      media_source: {
        source_type: "image_base64", content_type: "image/png",
        data: base64, is_standard: true,
      },
    });
    const response = await fetch(url, { ...init, body });
    if (response.status >= 400 && response.status < 500) {
      let parsed: unknown;
      try { parsed = await response.clone().json(); } catch { parsed = null; }
      const obj = parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed as Record<string, unknown> : {};
      const code = typeof obj.code === "number" ? String(obj.code)
        : typeof obj.code === "string" && /^[A-Za-z0-9_.:-]{1,80}$/.test(obj.code)
          ? obj.code : "UNAVAILABLE";
      const message = typeof obj.message === "string"
        ? obj.message.replace(/https?:\/\/\S+/gi, "[url]")
          .replace(/\b(?:authorization|access[_ -]?token|refresh[_ -]?token|client[_ -]?secret)\b\s*[:=]?\s*\S+/gi, "[secret]")
          .replace(/[A-Za-z0-9_-]{25,}/g, "[opaque]")
          .replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").slice(0, 160)
        : "UNAVAILABLE";
      console.log("PIN_BASE64_PROVIDER_HTTP=" + response.status);
      console.log("PIN_BASE64_PROVIDER_CODE=" + code);
      console.log("PIN_BASE64_PROVIDER_MESSAGE=" + message);
    }
    return response;
  };
  let transportCalls = 0;
  return {
    transport,
    countCalls: () => transportCalls,
  };
}

async function preflight() {
  const now = new Date();
  const [settings, pubs] = await Promise.all([
    prisma.growthSettings.findUnique({ where: { id: "global" },
      select: { enabled: true, attributionEnabled: true,
        workerActivationExpiresAt: true } }),
    Promise.all(CANDIDATES.map(x => loadLatest(x.id))),
  ]);
  if (!settings || settings.enabled || settings.attributionEnabled ||
      settings.workerActivationExpiresAt !== null) throw Error("GROWTH_NOT_IDLE");
  const ready = pubs.map((p, idx) => {
    if (!p || p.candidateId !== CANDIDATES[idx].id) {
      throw Error("APPROVED_PUBLICATION_MISSING");
    }
    exactNewApproval(p, now);
    return p;
  });
  const ids = ready.map(p => p.publishJob!.id);
  if (new Set(ids).size !== 2) throw Error("DUPLICATE_JOB_ID");
  const otherActive = await prisma.growthJob.count({
    where: { status: { in: ACTIVE }, id: { notIn: ids } },
  });
  if (otherActive !== 0) throw Error("UNRELATED_GROWTH_JOBS_ACTIVE");
  const hour = new Date(now.getTime() - 3_600_000);
  const day = new Date(now.getTime() - 86_400_000);
  const [hourly, daily, cooldown] = await Promise.all([
    prisma.growthActivity.count({ where: {
      entityType: "GrowthPinterestProviderBudget", entityId: "production-global",
      action: "PINTEREST_GLOBAL_API_REQUEST_RESERVED",
      createdAt: { gte: hour },
    } }),
    prisma.growthActivity.count({ where: {
      entityType: "GrowthPinterestProviderBudget", entityId: "production-global",
      action: "PINTEREST_GLOBAL_API_REQUEST_RESERVED",
      createdAt: { gte: day },
    } }),
    prisma.growthActivity.count({ where: {
      entityType: "GrowthPinterestProviderBudget", entityId: "production-global",
      action: "PINTEREST_GLOBAL_API_COOLDOWN",
      createdAt: { gte: hour },
    } }),
  ]);
  // Allow two Pinterest writes without exceeding the global 4/hour or 16/day caps.
  if (hourly > 2 || daily > 14 || cooldown > 0) {
    throw Error("PINTEREST_QUOTA_NOT_ADMISSIBLE");
  }
  return ready;
}

async function publishExact(ready: Publication[]) {
  const expiry = new Date(Date.now() + 240_000);
  const acquired = await prisma.growthSettings.updateMany({
    where: { id: "global", enabled: false, attributionEnabled: false,
      workerActivationExpiresAt: null },
    data: { enabled: true, workerActivationExpiresAt: expiry,
      configVersion: { increment: 1 } },
  });
  if (acquired.count !== 1) throw Error("LEASE_ACQUISITION_FAILED");
  let published = 0;
  try {
    for (const [index, row] of ready.entries()) {
      if (Date.now() > expiry.getTime() - 30_000) {
        throw Error("LEASE_NEAR_EXPIRY");
      }
      const { transport, countCalls } = await prepareDirectMedia(row);
      const jobId = row.publishJob!.id;
      const workerId = "pin-base64-reapproved:" + jobId;
      const claimed = await claimGrowthJobs({
        workerId, limit: 1, jobId,
        allowedTypes: [GrowthJobType.PINTEREST_PIN_PUBLISH],
      });
      if (claimed.length !== 1 || claimed[0].id !== jobId ||
          claimed[0].type !== GrowthJobType.PINTEREST_PIN_PUBLISH ||
          claimed[0].attemptCount !== 1) {
        throw Error("EXACT_JOB_CLAIM_REJECTED");
      }
      const job = claimed[0];
      await markGrowthJobRunning(job, workerId);
      try {
        // The deployed service remains authoritative for approval snapshot checks,
        // Pinterest budget reservation, write classification, and reconciliation.
        const result = await publishApprovedPin(row.id, transport);
        if (result.publication.status !== GrowthPublicationStatus.RECONCILED ||
            !result.publication.pinterestPinId ||
            countCalls() !== 1) throw Error("PIN_NOT_CONFIRMED");
        await completeGrowthJob(job, workerId, {
          publicationId: row.id,
          status: result.publication.status,
          reused: result.reused,
        });
        published += 1;
        console.log("PIN_BASE64_PUBLISHED=" + CANDIDATES[index].label);
      } catch (error) {
        await failGrowthJob(job, workerId, error).catch(() => {});
        throw Error("PIN_PUBLICATION_REJECTED");
      }
    }
  } finally {
    await revokeGrowthWorkerActivation(expiry);
  }
  const settings = await prisma.growthSettings.findUnique({
    where: { id: "global" },
    select: { enabled: true, attributionEnabled: true,
      workerActivationExpiresAt: true },
  });
  if (!settings || settings.enabled || settings.attributionEnabled ||
      settings.workerActivationExpiresAt !== null ||
      published !== 2) throw Error("POSTCONDITIONS_NOT_MET");
  console.log("PIN_BASE64_BATCH=PASSED");
  console.log("PIN_BASE64_RECONCILED_COUNT=" + published);
  console.log("PIN_BASE64_GROWTH=OFF");
  console.log("PIN_BASE64_AI_CALLS=0");
}

async function main() {
  let stage = "IDENTITY";
  try {
    checkRuntime();
    stage = "PREFLIGHT";
    const ready = await preflight();
    console.log("PIN_BASE64_PREFLIGHT=PASSED");
    stage = "PIN_PUBLICATION";
    await publishExact(ready);
  } catch {
    console.error("PIN_BASE64_BATCH=BLOCKED");
    console.error("PIN_BASE64_STAGE=" + stage);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect().catch(() => { process.exitCode = 1; });
  }
}
void main();
