import { readFileSync } from "node:fs";
import os from "node:os";
import {
  GrowthJobStatus,
  GrowthJobType,
  GrowthPinApprovalStatus,
  GrowthPinCandidateStatus,
  GrowthPublicationStatus,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { dispatchGrowthJob } from "@/lib/growth/handlers";
import {
  claimGrowthJobs,
  markGrowthJobRunning,
  completeGrowthJob,
  failGrowthJob,
} from "@/lib/growth/jobs";
import { revokeGrowthWorkerActivation } from "@/lib/growth/settings";

const RELEASE = "1f7f0560661a86947c3ce7c49c7a4669d41736f2";
const APP = "/home/saytwist/htdocs/saytwist.com";
const NODE = "/home/saytwist/.nvm/versions/node/v24.20.0/bin/node";
const PIN_BATCH = [
  { candidateId: "cmw5gct1u0015a5ajt0gg6gza", scheduledAt: "2026-11-06T21:05:00.000Z", label: "FLIRTY" },
  { candidateId: "cmw5gcsxc000pa5aju6j8g8uv", scheduledAt: "2026-11-06T21:10:00.000Z", label: "COLD_HEARTED" },
  { candidateId: "cmw5gcss30009a5ajv9pzwebg", scheduledAt: "2026-11-06T21:15:00.000Z", label: "JESTER" },
] as const;

const ACTIVE = [
  GrowthJobStatus.PENDING,
  GrowthJobStatus.CLAIMED,
  GrowthJobStatus.RUNNING,
  GrowthJobStatus.FAILED_RETRYABLE,
];

type PublishingRow = Awaited<ReturnType<typeof loadOne>>;

function authorizedIdentity() {
  const source = process.env.APPROVED_PIN_SOURCE_SHA || "";
  if (!/^[a-f0-9]{40}$/.test(source) ||
      process.env.APPROVED_PIN_RELEASE_SHA !== RELEASE ||
      process.env.APPROVED_PIN_ENTRYPOINT !== "true" ||
      process.env.APPROVED_PIN_OWNER_AUTH !==
        "RUN SAYTWIST APPROVED PIN BATCH " + source + ":" + RELEASE ||
      process.env.GROWTH_WORKER_RUN_ENABLED !== "false" ||
      process.env.GROWTH_ROLLOUT_MODE !== "OFF" ||
      process.env.GROWTH_AI_IMAGE_ENABLED !== "false" ||
      process.env.GROWTH_ATTRIBUTION_COLLECTION_ENABLED !== "false" ||
      process.env.NODE_ENV !== "production" ||
      process.execPath !== NODE ||
      process.cwd() !== APP ||
      os.userInfo().username !== "saytwist" ||
      process.getuid?.() === 0 ||
      readFileSync(APP + "/.deployed-release", "utf8").trim() !== RELEASE ||
      readFileSync(APP + "/.growth-approved-pin-batch/" + source + "/.source-sha", "utf8").trim() !== source) {
    throw Error("IDENTITY_INVALID");
  }
  const u = new URL(process.env.DATABASE_URL || "");
  if (!["postgres:", "postgresql:"].includes(u.protocol) ||
      u.hostname !== "127.0.0.1" || u.port !== "5433" ||
      decodeURIComponent(u.pathname.slice(1)) !== "saytwist" ||
      u.searchParams.has("host") || !u.username) {
    throw Error("DATABASE_TARGET_INVALID");
  }
  const app = new URL(process.env.APP_BASE_URL || "https://saytwist.com");
  if (app.origin !== "https://saytwist.com") throw Error("APP_ORIGIN_INVALID");
  const needed = [
    "PINTEREST_APP_ID",
    "PINTEREST_APP_SECRET",
    "PINTEREST_REDIRECT_URI",
    "PINTEREST_API_ENVIRONMENT",
    "GROWTH_CREDENTIAL_ENCRYPTION_KEY",
  ];
  if (needed.some(key => !process.env[key]) ||
      process.env.PINTEREST_API_ENVIRONMENT !== "production") {
    throw Error("PINTEREST_CONFIG_INVALID");
  }
}

async function loadOne(candidateId: string) {
  const publication = await prisma.growthPinPublication.findFirst({
    where: { candidateId },
    include: {
      approval: true,
      candidate: { include: { asset: true } },
      publishJob: true,
      board: true,
      account: true,
    },
    orderBy: [{ createdAt: "desc" }],
  });
  return publication;
}

function exactApproval(row: NonNullable<PublishingRow>, target: typeof PIN_BATCH[number]) {
  const job = row.publishJob;
  return row.candidateId === target.candidateId &&
    row.scheduledAt.toISOString() === target.scheduledAt &&
    row.status === GrowthPublicationStatus.SCHEDULED &&
    row.approval.status === GrowthPinApprovalStatus.APPROVED &&
    Boolean(row.approval.approvedById) &&
    row.approval.candidateId === target.candidateId &&
    row.approval.candidateRevision === row.candidate.revision &&
    row.approval.accountId === row.accountId &&
    row.approval.boardId === row.boardId &&
    row.approval.scheduledAt?.toISOString() === target.scheduledAt &&
    row.candidate.status === GrowthPinCandidateStatus.READY &&
    row.candidate.asset.mimeType === "image/png" &&
    row.candidate.asset.width === 1000 &&
    row.candidate.asset.height === 1500 &&
    row.board.isActive && row.board.accountId === row.accountId &&
    row.account.connectionStatus === "CONNECTED" &&
    row.account.apiEnvironment === "PRODUCTION" &&
    row.account.grantedScopes.includes("pins:write") &&
    row.account.grantedScopes.includes("boards:write") &&
    Boolean(job) &&
    job!.type === GrowthJobType.PINTEREST_PIN_PUBLISH &&
    job!.status === GrowthJobStatus.PENDING &&
    job!.attemptCount === 0 &&
    job!.runAfter.toISOString() === target.scheduledAt &&
    job!.idempotencyKey === row.idempotencyKey &&
    row.idempotencyKey === "pinterest-publish:" + row.id &&
    (job!.payload as { publicationId?: unknown })?.publicationId === row.id;
}

async function preflight() {
  const settings = await prisma.growthSettings.findUnique({
    where: { id: "global" },
    select: {
      enabled: true, attributionEnabled: true,
      workerActivationExpiresAt: true, aiMonthlyBudgetCents: true,
    },
  });
  if (!settings || settings.enabled || settings.attributionEnabled ||
      settings.workerActivationExpiresAt !== null) throw Error("GROWTH_NOT_IDLE");
  const rows = await Promise.all(PIN_BATCH.map(x => loadOne(x.candidateId)));
  if (rows.some((row, i) => !row || !exactApproval(row, PIN_BATCH[i]))) {
    throw Error("APPROVAL_OR_JOB_MISMATCH");
  }
  const ids = rows.map(row => row!.publishJob!.id);
  if (new Set(ids).size !== PIN_BATCH.length) throw Error("DUPLICATE_JOB_ID");
  const other = await prisma.growthJob.count({
    where: { status: { in: ACTIVE }, id: { notIn: ids } },
  });
  if (other !== 0) throw Error("OTHER_ACTIVE_GROWTH_JOB");
  return rows as Array<NonNullable<PublishingRow>>;
}

async function runBatch() {
  const rows = await preflight();
  const latestDue = new Date(PIN_BATCH[PIN_BATCH.length - 1].scheduledAt);
  if (Date.now() < latestDue.getTime()) throw Error("NOT_YET_DUE");
  if (Date.now() > latestDue.getTime() + 24 * 60 * 60_000) throw Error("BATCH_STALE");

  const lease = new Date(Date.now() + 180_000);
  const [claimedIds, results] = [new Set<string>(), [] as string[]];
  let leased = false;
  try {
    const acquired = await prisma.growthSettings.updateMany({
      where: {
        id: "global",
        enabled: false,
        attributionEnabled: false,
        workerActivationExpiresAt: null,
      },
      data: {
        enabled: true,
        workerActivationExpiresAt: lease,
        configVersion: { increment: 1 },
      },
    });
    if (acquired.count !== 1) throw Error("LEASE_NOT_ACQUIRED");
    leased = true;
    for (const [index, target] of PIN_BATCH.entries()) {
      const row = rows[index];
      const jobId = row.publishJob!.id;
      const workerId = "approved-pin-batch:" + jobId;
      if (Date.now() >= lease.getTime() - 30_000) throw Error("LEASE_TOO_SHORT");
      // Claims are restricted to one specific, owner-approved job ID.
      const claimed = await claimGrowthJobs({
        workerId, limit: 1, jobId,
        allowedTypes: [GrowthJobType.PINTEREST_PIN_PUBLISH],
      });
      if (claimed.length !== 1 || claimed[0].id !== jobId ||
          claimed[0].type !== GrowthJobType.PINTEREST_PIN_PUBLISH ||
          claimedIds.has(jobId)) throw Error("CLAIM_NOT_EXACT");
      const job = claimed[0];
      claimedIds.add(jobId);
      await markGrowthJobRunning(job, workerId);
      try {
        const outcome = await dispatchGrowthJob(job);
        await completeGrowthJob(job, workerId, outcome);
        const final = await prisma.growthPinPublication.findUnique({
          where: { id: row.id }, select: { status: true, pinterestPinId: true },
        });
        if (!final || final.status !== GrowthPublicationStatus.RECONCILED ||
            !final.pinterestPinId) throw Error("PUBLISH_NOT_RECONCILED");
        results.push(target.label);
        console.log("APPROVED_PIN_RECONCILED=" + target.label);
      } catch {
        await failGrowthJob(job, workerId, new Error("Approved Pin one-shot failed")).catch(() => {});
        throw Error("PUBLISH_STAGE_FAILED");
      }
    }
  } finally {
    if (leased) await revokeGrowthWorkerActivation(lease);
  }
  const settings = await prisma.growthSettings.findUnique({
    where: { id: "global" },
    select: {
      enabled: true, attributionEnabled: true,
      workerActivationExpiresAt: true,
    },
  });
  if (!settings || settings.enabled || settings.attributionEnabled ||
      settings.workerActivationExpiresAt !== null ||
      results.length !== PIN_BATCH.length) throw Error("POSTCONDITION_FAILED");
  console.log("APPROVED_PIN_BATCH=PASSED");
  console.log("APPROVED_PIN_PUBLISHED_COUNT=3");
  console.log("APPROVED_PIN_GROWTH=OFF");
}

async function main() {
  let stage = "IDENTITY";
  try {
    authorizedIdentity();
    stage = "PREFLIGHT";
    await preflight();
    console.log("APPROVED_PIN_PREFLIGHT=PASSED");
    stage = "PUBLISH";
    await runBatch();
  } catch {
    console.error("APPROVED_PIN_BATCH=BLOCKED");
    console.error("APPROVED_PIN_STAGE=" + stage);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect().catch(() => { process.exitCode = 1; });
  }
}
void main();
