import { readFileSync } from "node:fs";
import os from "node:os";
import {
  GrowthActivityActorKind, GrowthJobStatus, GrowthJobType,
  GrowthPinApprovalStatus, GrowthPublicationStatus, Prisma,
} from "@prisma/client";

import { recordGrowthActivity } from "@/lib/growth/activity";
import { prisma } from "@/lib/prisma";
import { revokeGrowthWorkerActivation } from "@/lib/growth/settings";
import { runGrowthWorker } from "@/lib/growth/worker";

const APP = "/home/saytwist/htdocs/saytwist.com";
const NODE = "/home/saytwist/.nvm/versions/node/v24.20.0/bin/node";
const LEASE_MS = 120_000;
const ROLLOUT = {
  GROWTH_WORKER_RUN_ENABLED: "true", GROWTH_ROLLOUT_MODE: "APPROVED_PUBLISH",
  GROWTH_APPROVED_PUBLISH_SCOPE: "true",
};
const ACTIVE = [GrowthJobStatus.CLAIMED, GrowthJobStatus.RUNNING];
const READY = [GrowthJobStatus.PENDING, GrowthJobStatus.FAILED_RETRYABLE];
const ELIGIBLE = [GrowthPublicationStatus.SCHEDULED, GrowthPublicationStatus.FAILED_RETRYABLE];

export function assertApprovedPublishRuntime(
  env: Record<string, string | undefined>, deployedSha: string,
  identity: { username: string; uid: number; cwd: string; node: string },
) {
  const sha = env.EXPECTED_RELEASE || "";
  if (!/^[a-f0-9]{40}$/.test(sha) || sha !== deployedSha ||
      env.GROWTH_APPROVED_PUBLISH_ENABLED !== "true" ||
      env.GROWTH_APPROVED_PUBLISH_APPROVAL !== "SAYTWIST_APPROVED_PIN_TIMER:" + sha ||
      env.NODE_ENV !== "production") throw Error("APPROVAL_INVALID");
  if (identity.username !== "saytwist" || identity.uid === 0 ||
      identity.cwd !== APP || identity.node !== NODE) throw Error("IDENTITY_INVALID");
  for (const flag of ["GROWTH_WORKER_RUN_ENABLED",
    "GROWTH_DAILY_REPORT_SCHEDULE_ENABLED", "TELEGRAM_REPORTS_ENABLED",
    "GROWTH_ATTRIBUTION_COLLECTION_ENABLED"]) {
    if (env[flag] === "true") throw Error("UNEXPECTED_AUTOMATION");
  }
  if (["OBSERVE", "RECOMMEND", "APPROVED_PUBLISH"].includes(
    env.GROWTH_ROLLOUT_MODE || "")) throw Error("GLOBAL_ROLLOUT_NOT_OFF");
  let db: URL;
  try { db = new URL(env.DATABASE_URL || ""); } catch { throw Error("DATABASE_INVALID"); }
  if (!["postgres:", "postgresql:"].includes(db.protocol) ||
      db.hostname !== "127.0.0.1" || db.port !== "5433" ||
      decodeURIComponent(db.pathname.slice(1)) !== "saytwist" ||
      db.searchParams.has("host") || !db.username) throw Error("DATABASE_INVALID");
  return sha;
}

async function requireIdleSettings() {
  const [settings, running] = await Promise.all([
    prisma.growthSettings.findUnique({ where: { id: "global" },
      select: { enabled: true, workerActivationExpiresAt: true, attributionEnabled: true } }),
    prisma.growthJob.count({ where: { status: { in: ACTIVE } } }),
  ]);
  if (!settings || settings.enabled || settings.attributionEnabled ||
      settings.workerActivationExpiresAt !== null || running > 0) {
    throw Error("GLOBAL_WORKER_BUSY");
  }
}

/** A candidate was explicitly and individually approved by an ADMIN before
 * its publication job was persisted by approvePinCandidate. Selection alone
 * never creates an approval or overwrites the immutable approval snapshot.
 */
export async function selectDueApprovedPin(now = new Date()) {
  const candidates = await prisma.growthPinPublication.findMany({
    where: {
      status: { in: ELIGIBLE }, scheduledAt: { lte: now },
      approval: { status: GrowthPinApprovalStatus.APPROVED },
    },
    orderBy: [{ scheduledAt: "asc" }, { createdAt: "asc" }],
    take: 25,
    select: {
      id: true, publishJobId: true, approvalId: true,
      publishJob: { select: { id: true, type: true, status: true, runAfter: true } },
    },
  });
  const eligible = candidates.filter(p =>
    p.publishJobId && p.publishJob?.id === p.publishJobId &&
    p.publishJob.type === GrowthJobType.PINTEREST_PIN_PUBLISH &&
    READY.includes(p.publishJob.status) && p.publishJob.runAfter <= now);
  return eligible[0] ?? null;
}

export async function runOneApprovedPublication(now = new Date()) {
  await requireIdleSettings();
  const selected = await selectDueApprovedPin(now);
  if (!selected?.publishJobId) return { status: "NO_DUE" as const };
  const deadline = new Date(Date.now() + LEASE_MS);
  let admitted = false;
  try {
    await prisma.$transaction(async tx => {
      const settings = await tx.growthSettings.findUnique({
        where: { id: "global" },
        select: { enabled: true, attributionEnabled: true, workerActivationExpiresAt: true },
      });
      const job = await tx.growthJob.findUnique({
        where: { id: selected.publishJobId! },
        select: { id: true, status: true, type: true, runAfter: true },
      });
      const publication = await tx.growthPinPublication.findUnique({
        where: { id: selected.id },
        select: { status: true, publishJobId: true, scheduledAt: true,
          approval: { select: { status: true } } },
      });
      if (!settings || settings.enabled || settings.attributionEnabled ||
          settings.workerActivationExpiresAt !== null ||
          await tx.growthJob.count({ where: { status: { in: ACTIVE } } }) !== 0 ||
          !job || job.type !== GrowthJobType.PINTEREST_PIN_PUBLISH ||
          !READY.includes(job.status) || job.runAfter > now ||
          !publication || publication.publishJobId !== job.id ||
          !ELIGIBLE.includes(publication.status) || publication.scheduledAt > now ||
          publication.approval.status !== GrowthPinApprovalStatus.APPROVED) {
        throw Error("APPROVAL_CHANGED_OR_WORKER_BUSY");
      }
      const updated = await tx.growthSettings.updateMany({
        where: { id: "global", enabled: false, attributionEnabled: false,
          workerActivationExpiresAt: null },
        data: { enabled: true, workerActivationExpiresAt: deadline,
          configVersion: { increment: 1 } },
      });
      if (updated.count !== 1) throw Error("PUBLISH_ADMISSION_RACE");
      await recordGrowthActivity({
        actorKind: GrowthActivityActorKind.SYSTEM, entityType: "GrowthJob",
        entityId: job.id, action: "APPROVED_PIN_SCHEDULED_EXECUTION",
        correlationKey: "approved-pin-timer:" + job.id,
        summary: { publicationId: selected.id, approvalId: selected.approvalId,
          jobType: job.type, scope: "ONE_APPROVED_PIN", deadline },
      }, tx);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10_000 });
    admitted = true;
    const outcome = await runGrowthWorker({
      onlyJobId: selected.publishJobId, batchSize: 1,
      workerId: "approved-pin-timer", rolloutConfig: ROLLOUT,
    });
    if (outcome.status !== "COMPLETED" || outcome.claimed !== 1 ||
        outcome.succeeded !== 1 || outcome.failed !== 0) {
      throw Error("APPROVED_PIN_JOB_FAILED");
    }
  } finally {
    if (admitted) await revokeGrowthWorkerActivation(deadline);
  }
  await requireIdleSettings();
  const [job, publication] = await Promise.all([
    prisma.growthJob.findUnique({ where: { id: selected.publishJobId },
      select: { status: true } }),
    prisma.growthPinPublication.findUnique({ where: { id: selected.id },
      select: { status: true } }),
  ]);
  if (job?.status !== GrowthJobStatus.SUCCEEDED || !publication ||
      ![GrowthPublicationStatus.RECONCILED, GrowthPublicationStatus.RECONCILING,
        GrowthPublicationStatus.PUBLISHED].includes(publication.status)) {
    throw Error("PUBLISH_OUTCOME_REQUIRES_REVIEW");
  }
  return { status: "ONE_JOB_COMPLETED" as const, publication: publication.status };
}

async function main() {
  try {
    assertApprovedPublishRuntime(process.env,
      readFileSync(".deployed-release", "utf8").trim(), {
        username: os.userInfo().username, uid: process.getuid?.() ?? -1,
        cwd: process.cwd(), node: process.execPath,
      });
    const result = await runOneApprovedPublication();
    console.log("GROWTH_APPROVED_PUBLISH=" + result.status);
    if (result.status === "ONE_JOB_COMPLETED") {
      console.log("GROWTH_APPROVED_PUBLICATION_STATE=" + result.publication);
    }
  } catch {
    console.error("GROWTH_APPROVED_PUBLISH=BLOCKED");
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect().catch(() => { process.exitCode = 1; });
  }
}
if (process.env.GROWTH_APPROVED_PUBLISH_ENTRYPOINT === "true") void main();
