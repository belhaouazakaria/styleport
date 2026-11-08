import { readFileSync } from "node:fs";
import os from "node:os";
import {
  GrowthActivityActorKind, GrowthDecisionStatus, GrowthJobStatus,
  GrowthJobType, GrowthOpportunityDestinationKind,
  GrowthOpportunityEvidenceQuality, GrowthOpportunityStatus, Prisma,
} from "@prisma/client";

import { recordGrowthActivity } from "@/lib/growth/activity";
import { countBlockingGrowthJobs } from "@/lib/growth/operations/approved-publication-queue";
import { IDEA_AUTOPILOT_VERSION } from "@/lib/growth/ideas/constants";
import { OPPORTUNITY_INTELLIGENCE_VERSION } from "@/lib/growth/opportunity/constants";
import { revokeGrowthWorkerActivation } from "@/lib/growth/settings";
import { TRANSLATOR_AUTOPILOT_VERSION } from "@/lib/growth/translator/constants";
import { runGrowthWorker } from "@/lib/growth/worker";
import { prisma } from "@/lib/prisma";

const APP = "/home/saytwist/htdocs/saytwist.com";
const NODE = "/home/saytwist/.nvm/versions/node/v24.20.0/bin/node";
const LEASE_MS = 240_000;
const ROLLOUT = {
  GROWTH_WORKER_RUN_ENABLED: "true", GROWTH_ROLLOUT_MODE: "PREPARE",
  GROWTH_AUTONOMOUS_CONTENT_SCOPE: "true",
};

export function assertAutonomousContentRuntime(
  env: Record<string, string | undefined>, deployedSha: string,
  identity: { username: string; uid: number; cwd: string; node: string },
  now = new Date(),
) {
  const sha = env.EXPECTED_RELEASE || "";
  const day = env.GROWTH_AUTONOMOUS_CONTENT_DATE || "";
  if (!/^[a-f0-9]{40}$/.test(sha) || sha !== deployedSha ||
      env.NODE_ENV !== "production" ||
      env.GROWTH_AUTONOMOUS_CONTENT_ENABLED !== "true" ||
      env.GROWTH_AUTONOMOUS_CONTENT_APPROVAL !== "SAYTWIST_CONTENT_PREPARATION:" + sha ||
      day !== now.toISOString().slice(0, 10) ||
      !(now.getUTCHours() === 6 && now.getUTCMinutes() >= 30 &&
        now.getUTCMinutes() < 50)) throw Error("RELEASE_OR_APPROVAL_INVALID");
  if (identity.username !== "saytwist" || identity.uid === 0 ||
      identity.cwd !== APP || identity.node !== NODE) throw Error("IDENTITY_INVALID");
  for (const flag of ["GROWTH_WORKER_RUN_ENABLED",
    "GROWTH_DAILY_REPORT_SCHEDULE_ENABLED", "TELEGRAM_REPORTS_ENABLED",
    "GROWTH_ATTRIBUTION_COLLECTION_ENABLED"]) {
    if (env[flag] === "true") throw Error("CONFLICTING_AUTOMATION");
  }
  if (["OBSERVE", "RECOMMEND", "PREPARE", "APPROVED_PUBLISH"].includes(
    env.GROWTH_ROLLOUT_MODE || "")) throw Error("ROLLOUT_NOT_OFF");
  let db: URL;
  try { db = new URL(env.DATABASE_URL || ""); } catch { throw Error("DB_INVALID"); }
  if (!["postgres:", "postgresql:"].includes(db.protocol) ||
      db.hostname !== "127.0.0.1" || db.port !== "5433" ||
      decodeURIComponent(db.pathname.slice(1)) !== "saytwist" ||
      db.searchParams.has("host") || !db.username) throw Error("DB_INVALID");
  return { sha, day };
}

export function planContentOpportunities(rows: Array<{
  id: string; score: number; confidence: number;
  targetDestinationKind: GrowthOpportunityDestinationKind | null;
}>) {
  const ordered = [...rows].sort((a,b) =>
    b.score - a.score || b.confidence - a.confidence || a.id.localeCompare(b.id));
  const translator = ordered.find(r => r.score >= 75 && r.confidence >= 80 &&
    r.targetDestinationKind === GrowthOpportunityDestinationKind.TRANSLATOR);
  const idea = ordered.find(r => r.id !== translator?.id &&
    r.score >= 70 && r.confidence >= 75 &&
    r.targetDestinationKind === GrowthOpportunityDestinationKind.FUTURE_IDEAS);
  return [
    ...(translator ? [{ id: translator.id, kind: "TRANSLATOR" as const }] : []),
    ...(idea ? [{ id: idea.id, kind: "IDEA" as const }] : []),
  ];
}

/**
 * Single-ID scoped job lifecycle. Existing decision handlers can enqueue one
 * separate execution job; it is NEVER auto-claimed alongside a decision.
 * Every job requires its own 240s activation lease and result inspection.
 * No retry on uncertainty. Content quotas, AI project isolation, uniqueness
 * and quality checks remain in the original application handlers.
 */
async function runScopedContentJob(input: {
  type: GrowthJobType; key: string; payload?: Record<string, string>;
  existingJobId?: string;
}) {
  const deadline = new Date(Date.now() + LEASE_MS);
  let admitted = false;
  let jobId: string | null = null;
  try {
    jobId = await prisma.$transaction(async tx => {
      const settings = await tx.growthSettings.findUnique({
        where: { id: "global" },
        select: { enabled: true, attributionEnabled: true, workerActivationExpiresAt: true },
      });
      // Only correctly bound, future owner-approved Pin jobs may coexist.
      // A claimed/running publisher, malformed approval or any other active
      // job blocks content preparation before the global activation lease.
      const blocking = await countBlockingGrowthJobs(
        tx, input.existingJobId ? [input.existingJobId] : [],
      );
      if (!settings || settings.enabled || settings.attributionEnabled ||
          settings.workerActivationExpiresAt !== null || blocking > 0) {
        throw Error("CONTENT_WORKER_NOT_IDLE");
      }
      let job;
      if (input.existingJobId) {
        job = await tx.growthJob.findUnique({
          where: { id: input.existingJobId },
          select: { id: true, type: true, status: true, attemptCount: true },
        });
        if (!job || job.type !== input.type ||
            job.status !== GrowthJobStatus.PENDING || job.attemptCount !== 0) {
          throw Error("CONTENT_EXECUTION_NOT_NEW");
        }
      } else {
        const exists = await tx.growthJob.findUnique({
          where: { idempotencyKey: input.key }, select: { id: true },
        });
        if (exists) throw Error("CONTENT_JOB_ALREADY_ATTEMPTED");
        job = await tx.growthJob.create({
          data: { type: input.type, idempotencyKey: input.key,
            payload: input.payload || {}, maxAttempts: 1 },
          select: { id: true },
        });
      }
      const changed = await tx.growthSettings.updateMany({
        where: { id: "global", enabled: false, attributionEnabled: false,
          workerActivationExpiresAt: null },
        data: { enabled: true, workerActivationExpiresAt: deadline,
          configVersion: { increment: 1 } },
      });
      if (changed.count !== 1) throw Error("CONTENT_LEASE_RACE");
      await recordGrowthActivity({
        actorKind: GrowthActivityActorKind.SYSTEM, entityType: "GrowthJob",
        entityId: job.id, action: "AUTONOMOUS_CONTENT_JOB_ADMITTED",
        correlationKey: input.key, summary: {
          type: input.type, mode: "ONE_JOB_PREPARE", maxAttempts: 1,
        },
      }, tx);
      return job.id;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10_000 });
    admitted = true;
    const result = await runGrowthWorker({
      onlyJobId: jobId, batchSize: 1, workerId: "growth-preparation-" + input.type.toLowerCase(),
      rolloutConfig: ROLLOUT,
    });
    if (result.status !== "COMPLETED" || result.claimed !== 1 ||
        result.succeeded !== 1 || result.failed !== 0) {
      throw Error("CONTENT_WORKER_JOB_FAILED");
    }
  } finally {
    if (admitted) await revokeGrowthWorkerActivation(deadline);
  }
  const [state, settings] = await Promise.all([
    prisma.growthJob.findUnique({ where: { id: jobId! }, select: { status: true } }),
    prisma.growthSettings.findUnique({ where: { id: "global" },
      select: { enabled: true, workerActivationExpiresAt: true } }),
  ]);
  if (!state || state.status !== GrowthJobStatus.SUCCEEDED ||
      !settings || settings.enabled || settings.workerActivationExpiresAt !== null) {
    throw Error("CONTENT_JOB_POSTCONDITION_FAILED");
  }
  return jobId!;
}

export async function runAutonomousPreparation(day: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw Error("DATE_INVALID");
  const at = new Date(day + "T00:00:00.000Z");
  if (at.toISOString().slice(0, 10) !== day) throw Error("DATE_INVALID");
  const sourceJobs = ["strategy", "opportunity", "learning"].map(stage =>
    "growth-cycle-v1:" + day + ":" + stage);
  const sources = await prisma.growthJob.findMany({
    where: { idempotencyKey: { in: sourceJobs }, status: GrowthJobStatus.SUCCEEDED },
    select: { idempotencyKey: true },
  });
  if (sources.length !== 3) throw Error("CURRENT_ANALYSIS_MISSING");
  const opportunities = await prisma.growthOpportunity.findMany({
    where: {
      status: GrowthOpportunityStatus.OPEN,
      evidenceQuality: GrowthOpportunityEvidenceQuality.KNOWN,
      analysisRun: { is: {
        analysisDate: at, intelligenceModelVersion: OPPORTUNITY_INTELLIGENCE_VERSION,
      } },
    },
    select: { id: true, score: true, confidence: true, targetDestinationKind: true },
    orderBy: [{ score: "desc" }, { confidence: "desc" }, { id: "asc" }],
    take: 30,
  });
  const selected = planContentOpportunities(opportunities);
  let prepared = 0;
  for (const item of selected) {
    const isTranslator = item.kind === "TRANSLATOR";
    const kind = isTranslator ? GrowthJobType.TRANSLATOR_AUTOPILOT_DECIDE
      : GrowthJobType.IDEA_AUTOPILOT_DECIDE;
    const modelVersion = isTranslator ? TRANSLATOR_AUTOPILOT_VERSION : IDEA_AUTOPILOT_VERSION;
    const key = "growth-content-v1:" + day + ":" + item.kind + ":" + item.id;
    const decisionJob = await runScopedContentJob({
      type: kind, key, payload: { opportunityId: item.id,
        decisionModelVersion: modelVersion },
    });
    const decision = await prisma.growthDecision.findFirst({
      where: { opportunityId: item.id, decisionModelVersion: modelVersion },
      select: { id: true, status: true, executionJobId: true,
        translatorId: true, ideaId: true },
      orderBy: { createdAt: "desc" },
    });
    if (!decision) throw Error("DECISION_NOT_RECORDED");
    if (decision.executionJobId) {
      await runScopedContentJob({
        type: isTranslator ? GrowthJobType.TRANSLATOR_AUTOPILOT_EXECUTE
          : GrowthJobType.IDEA_AUTOPILOT_EXECUTE,
        key: key + ":execute", existingJobId: decision.executionJobId,
      });
    }
    const final = await prisma.growthDecision.findUnique({
      where: { id: decision.id }, select: {
        id: true, status: true, translatorId: true, ideaId: true,
      },
    });
    if (final?.status === GrowthDecisionStatus.COMPLETED) prepared++;
    // New Translator and Idea assets are deliberately created unpublished.
    // Do not prepare a destination Pin until it is publicly active and verified.
    // The existing daily-fresh AI pipeline handles already published Translators.
    // Retain the direct decision job for immutable traceability, not as
    // permission to publish. Publishing still requires per-Pin ADMIN approval.
    if (!decisionJob) throw Error("DECISION_JOB_MISSING");
  }
  return { selected: selected.length, prepared };
}

async function main() {
  try {
    const { day } = assertAutonomousContentRuntime(process.env,
      readFileSync(".deployed-release", "utf8").trim(), {
        username: os.userInfo().username, uid: process.getuid?.() ?? -1,
        cwd: process.cwd(), node: process.execPath,
      });
    const result = await runAutonomousPreparation(day);
    console.log("GROWTH_AUTONOMOUS_CONTENT=PASSED");
    console.log("GROWTH_AUTONOMOUS_DECISIONS=" + result.selected);
    console.log("GROWTH_AUTONOMOUS_CONTENT_PREPARED=" + result.prepared);
    console.log("GROWTH_AUTONOMOUS_PIN_CANDIDATES=0");
    console.log("GROWTH_AUTONOMOUS_PUBLICATIONS=0");
  } catch {
    console.error("GROWTH_AUTONOMOUS_CONTENT=BLOCKED");
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect().catch(() => { process.exitCode = 1; });
  }
}
if (process.env.GROWTH_AUTONOMOUS_CONTENT_ENTRYPOINT === "true") void main();
