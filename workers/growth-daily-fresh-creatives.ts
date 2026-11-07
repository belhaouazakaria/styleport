import { readFileSync } from "node:fs";
import os from "node:os";
import {
  GrowthAssetGenerationKind,
  GrowthCreativeArchetype,
  GrowthCreativeDestinationKind,
  GrowthJobStatus,
  GrowthJobType,
  GrowthPinCandidateStatus,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { enqueueCreativeGeneration } from "@/lib/growth/creative/candidates";
import { CREATIVE_LAB_VERSION } from "@/lib/growth/creative/constants";
import { dispatchGrowthJob } from "@/lib/growth/handlers";
import { claimGrowthJobs, completeGrowthJob, failGrowthJob, markGrowthJobRunning } from "@/lib/growth/jobs";
import { countBlockingGrowthJobs } from "@/lib/growth/operations/approved-publication-queue";
import { planDailyFreshCreatives } from "@/lib/growth/operations/daily-fresh-creative-plan";
import { DEFAULT_DAILY_CADENCE_POLICY } from "@/lib/growth/portfolio/daily-cadence";
import { revokeGrowthWorkerActivation } from "@/lib/growth/settings";

const APP = "/home/saytwist/htdocs/saytwist.com";
const NODE = "/home/saytwist/.nvm/versions/node/v24.20.0/bin/node";
const LEASE_MS = 270_000; // Under the watchdog 5-minute maximum; one paid image per lease.
const MIN_DESCRIPTION_LENGTH = 40;

export function assertDailyFreshRuntime(
  env: Record<string, string | undefined>,
  deployedSha: string,
  identity: { username: string; uid: number; cwd: string; node: string },
  now = new Date(),
) {
  const sha = env.EXPECTED_RELEASE || "";
  const day = env.GROWTH_DAILY_FRESH_DAY || "";
  const mode = env.GROWTH_DAILY_FRESH_MODE || "";
  const approval = mode === "SCHEDULED"
    ? "SAYTWIST_DAILY_FRESH_SCHEDULED:" + sha
    : "RUN SAYTWIST DAILY FRESH TRIAL " + sha;
  if (!/^[a-f0-9]{40}$/.test(sha) || sha !== deployedSha ||
      day !== now.toISOString().slice(0, 10) ||
      !["SCHEDULED", "TRIAL"].includes(mode) ||
      env.GROWTH_DAILY_FRESH_ENABLED !== "true" ||
      env.GROWTH_DAILY_FRESH_APPROVAL !== approval ||
      env.NODE_ENV !== "production" ||
      identity.username !== "saytwist" || identity.uid === 0 ||
      identity.cwd !== APP || identity.node !== NODE) throw Error("FRESH_RELEASE_OR_RUNTIME_INVALID");
  if (mode === "SCHEDULED" &&
      !(now.getUTCHours() === 7 && now.getUTCMinutes() >= 2 && now.getUTCMinutes() < 15)) {
    throw Error("FRESH_SCHEDULE_WINDOW_INVALID");
  }
  for (const flag of [
    "GROWTH_WORKER_RUN_ENABLED", "GROWTH_DAILY_REPORT_SCHEDULE_ENABLED",
    "TELEGRAM_REPORTS_ENABLED", "GROWTH_ATTRIBUTION_COLLECTION_ENABLED",
  ]) if (env[flag] !== "false") throw Error("FRESH_OTHER_AUTOMATION_ENABLED");
  // Only a separately scoped, priced GPT Image 2 job is authorized here.
  if (env.GROWTH_AI_IMAGE_ENABLED !== "true" ||
      env.GROWTH_OPENAI_IMAGE_MODEL !== "gpt-image-2" ||
      !/^sk-[A-Za-z0-9_-]{12,}$/.test(env.GROWTH_OPENAI_API_KEY || "") ||
      !/^proj_[A-Za-z0-9_-]{3,128}$/.test(env.GROWTH_OPENAI_PROJECT_ID || "") ||
      env.GROWTH_ROLLOUT_MODE !== "OFF" ||
      env.APP_BASE_URL !== "https://saytwist.com") throw Error("FRESH_AI_SCOPE_INVALID");
  const db = new URL(env.DATABASE_URL || "");
  if (!["postgres:", "postgresql:"].includes(db.protocol) ||
      db.hostname !== "127.0.0.1" || db.port !== "5433" ||
      decodeURIComponent(db.pathname.slice(1)) !== "saytwist" ||
      db.searchParams.has("host") || !db.username) throw Error("FRESH_DB_INVALID");
  return { sha, day, mode };
}

async function requireIdle(excludeJobId?: string) {
  const [settings, blockers] = await Promise.all([
    prisma.growthSettings.findUnique({ where: { id: "global" },
      select: { enabled: true, attributionEnabled: true,
        workerActivationExpiresAt: true } }),
    countBlockingGrowthJobs(prisma, excludeJobId ? [excludeJobId] : []),
  ]);
  if (!settings || settings.enabled || settings.attributionEnabled ||
      settings.workerActivationExpiresAt !== null || blockers !== 0) {
    throw Error("FRESH_GROWTH_NOT_IDLE");
  }
}

async function buildBatch(day: string, now = new Date()) {
  await requireIdle();
  const dayStart = new Date(day + "T00:00:00Z");
  const dayEnd = new Date(dayStart.getTime() + 86_400_000);
  const [policy, already, recentEvidence, accounts, available] = await Promise.all([
    prisma.growthDailyCadencePreference.findUnique({
      where: { id: "global" },
      select: { pinMode: true, pinMinimum: true,
        pinMaximum: true, pinFixed: true },
    }),
    prisma.growthPinCandidate.count({ where: {
      createdAt: { gte: dayStart, lt: dayEnd },
    } }),
    prisma.growthOpportunityAnalysisRun.findFirst({
      where: {
        completedAt: { gte: new Date(now.getTime() - 48 * 60 * 60_000) },
        evidenceQuality: "KNOWN", opportunitiesProduced: { gt: 0 },
      },
      select: { id: true },
      orderBy: { completedAt: "desc" },
    }),
    prisma.growthPinterestAccount.findMany({
      where: { apiEnvironment: "PRODUCTION", connectionStatus: "CONNECTED",
        encryptedCredentials: { not: null }, boards: { some: { isActive: true } },
        grantedScopes: { hasEvery: ["pins:read", "pins:write", "boards:read", "boards:write"] } },
      select: { id: true }, take: 2,
    }),
    prisma.translator.findMany({
      where: {
        isActive: true, archivedAt: null,
        examples: { some: {} },
        growthPinCandidates: { none: {} },
      },
      select: { id: true, slug: true, shortDescription: true,
        isFeatured: true, sortOrder: true },
      orderBy: [
        { isFeatured: "desc" }, { sortOrder: "asc" }, { slug: "asc" },
      ],
      take: 90,
    }),
  ]);
  if (accounts.length !== 1) throw Error("FRESH_ACCOUNT_NOT_QUALIFIED");
  const qualified = available.filter(target =>
    target.shortDescription.trim().length >= MIN_DESCRIPTION_LENGTH);
  const parsedPolicy = policy
    ? { mode: policy.pinMode, minimum: policy.pinMinimum,
      maximum: policy.pinMaximum, fixed: policy.pinFixed }
    : DEFAULT_DAILY_CADENCE_POLICY.pinCreatives;
  const planned = planDailyFreshCreatives({
    policy: parsedPolicy as typeof DEFAULT_DAILY_CADENCE_POLICY.pinCreatives,
    alreadyCreatedToday: already,
    eligibleDistinctTargets: qualified.length,
    verifiedRecentOpportunityEvidence: Boolean(recentEvidence),
  });
  return { planned, targets: qualified.slice(0, planned.additional), accountId: accounts[0].id };
}

async function createOne(target: { id: string; slug: string }, day: string, accountId: string) {
  await requireIdle();
  const request = {
    targetKind: GrowthCreativeDestinationKind.TRANSLATOR,
    targetId: target.id,
    archetype: GrowthCreativeArchetype.BEFORE_AFTER,
    useAiExample: false, // Reuse verified saved before/after copy. Image is fully AI-generated.
    accountId,
    creativeModelVersion: CREATIVE_LAB_VERSION,
  };
  const queued = await enqueueCreativeGeneration(request, {
    runAfter: new Date(Date.now() - 1000),
    idempotencyScope: "daily-ai-fresh-v2:" + day + ":" + target.slug,
  });
  if (!queued.created || queued.job.status !== GrowthJobStatus.PENDING ||
      queued.job.type !== GrowthJobType.CREATIVE_LAB_GENERATE) {
    throw Error("FRESH_JOB_NOT_UNIQUE");
  }
  const jobId = queued.job.id;
  const updated = await prisma.growthJob.updateMany({
    where: { id: jobId, status: GrowthJobStatus.PENDING,
      type: GrowthJobType.CREATIVE_LAB_GENERATE },
    data: { maxAttempts: 1 },
  });
  if (updated.count !== 1) throw Error("FRESH_JOB_ADMISSION_CHANGED");
  await requireIdle(jobId);
  const deadline = new Date(Date.now() + LEASE_MS);
  let leased = false;
  try {
    const admitted = await prisma.growthSettings.updateMany({
      where: { id: "global", enabled: false, attributionEnabled: false,
        workerActivationExpiresAt: null },
      data: { enabled: true, workerActivationExpiresAt: deadline,
        configVersion: { increment: 1 } },
    });
    if (admitted.count !== 1) throw Error("FRESH_LEASE_RACE");
    leased = true;
    const workerId = "growth-fresh-v1:" + jobId;
    const jobs = await claimGrowthJobs({
      workerId, jobId, limit: 1,
      allowedTypes: [GrowthJobType.CREATIVE_LAB_GENERATE],
    });
    if (jobs.length !== 1 || jobs[0].id !== jobId ||
        jobs[0].attemptCount !== 1 ||
        jobs[0].type !== GrowthJobType.CREATIVE_LAB_GENERATE) {
      throw Error("FRESH_EXACT_JOB_CLAIM_FAILED");
    }
    const job = jobs[0];
    await markGrowthJobRunning(job, workerId);
    try {
      const summary = await dispatchGrowthJob(job);
      await completeGrowthJob(job, workerId, summary);
    } catch (error) {
      await failGrowthJob(job, workerId, error);
      throw Error("FRESH_GENERATION_FAILED");
    }
  } finally {
    if (leased) await revokeGrowthWorkerActivation(deadline);
  }
  await requireIdle();
  const candidate = await prisma.growthPinCandidate.findUnique({
    where: { generationJobId: jobId },
    select: {
      status: true, translatorId: true,
      asset: { select: {
        generationKind: true, width: true, height: true, mimeType: true,
        aiProvider: true, aiModel: true,
      } },
    },
  });
  if (!candidate || candidate.status !== GrowthPinCandidateStatus.READY ||
      candidate.translatorId !== target.id ||
      candidate.asset.generationKind !== GrowthAssetGenerationKind.AI ||
      candidate.asset.aiProvider !== "OPENAI" ||
      candidate.asset.aiModel !== "gpt-image-2" ||
      candidate.asset.mimeType !== "image/png" ||
      candidate.asset.width !== 1000 || candidate.asset.height !== 1500) {
    throw Error("FRESH_CREATED_NOT_APPROVABLE");
  }
}

export async function executeDailyFreshCreativeCycle(day: string) {
  const { planned, targets, accountId } = await buildBatch(day);
  if (planned.additional === 0) {
    await requireIdle();
    return { status: planned.status, created: 0, aiCalls: 0, pinsPublished: 0 };
  }
  let created = 0;
  for (const target of targets) {
    await createOne(target, day, accountId);
    created++;
  }
  await requireIdle();
  return { status: "PASSED" as const, created, aiCalls: created, pinsPublished: 0 };
}

async function main() {
  let stage = "RUNTIME";
  try {
    const { day } = assertDailyFreshRuntime(
      process.env,
      readFileSync(APP + "/.deployed-release", "utf8").trim(),
      { username: os.userInfo().username,
        uid: process.getuid?.() ?? -1, cwd: process.cwd(),
        node: process.execPath },
    );
    stage = "GENERATE";
    const result = await executeDailyFreshCreativeCycle(day);
    console.log("GROWTH_DAILY_FRESH=" + result.status);
    console.log("GROWTH_DAILY_FRESH_CREATED=" + result.created);
    console.log("GROWTH_DAILY_FRESH_AI_CALLS=" + result.aiCalls);
    console.log("GROWTH_DAILY_FRESH_PINS_PUBLISHED=" + result.pinsPublished);
    console.log("GROWTH_DAILY_FRESH_GROWTH=OFF");
  } catch {
    console.error("GROWTH_DAILY_FRESH=BLOCKED");
    console.error("GROWTH_DAILY_FRESH_STAGE=" + stage);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect().catch(() => { process.exitCode = 1; });
  }
}
if (process.env.GROWTH_DAILY_FRESH_ENTRYPOINT === "true") void main();
