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

import { enqueueCreativeGeneration } from "@/lib/growth/creative/candidates";
import { CREATIVE_LAB_VERSION } from "@/lib/growth/creative/constants";
import { dispatchGrowthJob } from "@/lib/growth/handlers";
import {
  claimGrowthJobs,
  completeGrowthJob,
  failGrowthJob,
  markGrowthJobRunning,
} from "@/lib/growth/jobs";
import { revokeGrowthWorkerActivation } from "@/lib/growth/settings";
import { prisma } from "@/lib/prisma";

/**
 * Owner-authorized, single execution to produce at most three NEW, deterministic
 * approval-only 1000x1500 Creative Lab candidates. Never schedules publication,
 * invokes Pinterest, buys AI, or touches previous candidates. Existing deployed
 * application modules and their duplicate/destination checks remain authoritative.
 */
const APP = "/home/saytwist/htdocs/saytwist.com";
const NODE = "/home/saytwist/.nvm/versions/node/v24.20.0/bin/node";
const ACTIVE = [
  GrowthJobStatus.PENDING,
  GrowthJobStatus.CLAIMED,
  GrowthJobStatus.RUNNING,
  GrowthJobStatus.FAILED_RETRYABLE,
];

const PREFERRED = [
  "yandere-language-translator",
  "jester-translator",
  "cold-hearted-cunning-manipulative-translator",
  "extremely-flirty-speech-translator",
  "overly-talkative-girl-translator",
  "cute-speech-translator",
  "boy-to-girl-voice-translator",
  "1890s-victorian-english-translator",
] as const;

function assertIdentity() {
  const source = process.env.FRESH_CREATIVE_SOURCE_SHA || "";
  const release = process.env.FRESH_CREATIVE_DEPLOYED_SHA || "";
  const approval = process.env.FRESH_CREATIVE_APPROVAL || "";
  if (!/^[a-f0-9]{40}$/.test(source) ||
      !/^[a-f0-9]{40}$/.test(release) ||
      approval !== "RUN SAYTWIST FRESH CREATIVES " + source + ":" + release ||
      process.env.FRESH_CREATIVE_ENTRYPOINT !== "true" ||
      readFileSync(APP + "/.deployed-release", "utf8").trim() !== release ||
      readFileSync(APP + "/.growth-fresh-creatives/" + source + "/.source-sha", "utf8").trim() !== source ||
      process.cwd() !== APP ||
      os.userInfo().username !== "saytwist" ||
      process.getuid?.() === 0 || process.execPath !== NODE ||
      process.env.NODE_ENV !== "production" ||
      process.env.GROWTH_WORKER_RUN_ENABLED !== "false" ||
      process.env.GROWTH_ROLLOUT_MODE !== "OFF" ||
      process.env.GROWTH_AI_IMAGE_ENABLED !== "false") {
    throw Error("IDENTITY_OR_APPROVAL_INVALID");
  }
  const url = new URL(process.env.DATABASE_URL || "");
  if (!["postgres:", "postgresql:"].includes(url.protocol) ||
      url.hostname !== "127.0.0.1" || url.port !== "5433" ||
      decodeURIComponent(url.pathname.slice(1)) !== "saytwist" ||
      url.searchParams.has("host") || !url.username) {
    throw Error("DB_TARGET_INVALID");
  }
  return { source, release };
}

async function requireIdle(excludedJobId?: string) {
  const [settings, queued] = await Promise.all([
    prisma.growthSettings.findUnique({
      where: { id: "global" },
      select: {
        enabled: true,
        attributionEnabled: true,
        workerActivationExpiresAt: true,
      },
    }),
    prisma.growthJob.count({
      where: {
        status: { in: ACTIVE },
        ...(excludedJobId ? { id: { not: excludedJobId } } : {}),
      },
    }),
  ]);
  if (!settings || settings.enabled || settings.attributionEnabled ||
      settings.workerActivationExpiresAt !== null || queued !== 0) {
    throw Error("GROWTH_NOT_IDLE");
  }
}

async function generateOne(
  target: { id: string; slug: string },
  source: string,
  release: string,
  day: string,
) {
  await requireIdle();
  const request = {
    targetKind: GrowthCreativeDestinationKind.TRANSLATOR,
    targetId: target.id,
    archetype: GrowthCreativeArchetype.MINIMAL_STATEMENT,
    useAiExample: false,
    creativeModelVersion: CREATIVE_LAB_VERSION,
  };
  const queued = await enqueueCreativeGeneration(request, {
    runAfter: new Date(Date.now() - 1000),
    idempotencyScope: "fresh-one-shot:" + source + ":" + day + ":" + target.slug,
  });
  if (!queued.created || queued.job.status !== GrowthJobStatus.PENDING ||
      queued.job.type !== GrowthJobType.CREATIVE_LAB_GENERATE) {
    throw Error("JOB_NOT_NEW");
  }
  const changed = await prisma.growthJob.updateMany({
    where: { id: queued.job.id, status: GrowthJobStatus.PENDING },
    data: { maxAttempts: 1 },
  });
  if (changed.count !== 1) throw Error("JOB_PREPARE_FAILED");

  const deadline = new Date(Date.now() + 120_000);
  const claimedBy = "fresh-creative:" + queued.job.id;
  let claimedJob: Awaited<ReturnType<typeof claimGrowthJobs>>[number] | null = null;
  let started = false;
  let leaseAdmitted = false;
  try {
    await prisma.$transaction(async tx => {
      const settings = await tx.growthSettings.findUnique({
        where: { id: "global" },
        select: {
          enabled: true, attributionEnabled: true,
          workerActivationExpiresAt: true,
        },
      });
      const otherActive = await tx.growthJob.count({
        where: { status: { in: ACTIVE }, id: { not: queued.job.id } },
      });
      if (!settings || settings.enabled || settings.attributionEnabled ||
          settings.workerActivationExpiresAt !== null || otherActive !== 0) {
        throw Error("LEASE_NOT_IDLE");
      }
      const updated = await tx.growthSettings.updateMany({
        where: {
          id: "global", enabled: false, attributionEnabled: false,
          workerActivationExpiresAt: null,
        },
        data: {
          enabled: true, workerActivationExpiresAt: deadline,
          configVersion: { increment: 1 },
        },
      });
      if (updated.count !== 1) throw Error("LEASE_RACE");
    });
    leaseAdmitted = true;

    const jobs = await claimGrowthJobs({
      workerId: claimedBy,
      limit: 1,
      allowedTypes: [GrowthJobType.CREATIVE_LAB_GENERATE],
      jobId: queued.job.id,
    });
    if (jobs.length !== 1 || jobs[0].id !== queued.job.id ||
        jobs[0].maxAttempts !== 1) throw Error("EXACT_CLAIM_FAILED");
    claimedJob = jobs[0];
    const currentLease = await prisma.growthSettings.findUnique({
      where: { id: "global" },
      select: { enabled: true, workerActivationExpiresAt: true },
    });
    if (!currentLease?.enabled ||
        currentLease.workerActivationExpiresAt?.getTime() !== deadline.getTime() ||
        Date.now() >= deadline.getTime()) throw Error("LEASE_CHANGED");

    await markGrowthJobRunning(claimedJob, claimedBy);
    started = true;
    const summary = await dispatchGrowthJob(claimedJob);
    await completeGrowthJob(claimedJob, claimedBy, summary);
    started = false;

    const candidate = await prisma.growthPinCandidate.findUnique({
      where: { generationJobId: queued.job.id },
      select: {
        id: true, status: true, translatorId: true,
        asset: {
          select: {
            generationKind: true, mimeType: true,
            width: true, height: true,
          },
        },
      },
    });
    if (!candidate || candidate.translatorId !== target.id ||
        candidate.status !== GrowthPinCandidateStatus.READY ||
        candidate.asset.generationKind !== GrowthAssetGenerationKind.DETERMINISTIC ||
        candidate.asset.mimeType !== "image/png" ||
        candidate.asset.width !== 1000 || candidate.asset.height !== 1500) {
      throw Error("CANDIDATE_NOT_READY");
    }
    console.log("FRESH_CREATIVE_READY=" + target.slug + "|" + candidate.id);
  } catch {
    if (started && claimedJob) {
      await failGrowthJob(claimedJob, claimedBy,
        new Error("Fresh Creative one-shot failed")).catch(() => {});
    }
    throw Error("ONE_CREATIVE_FAILED");
  } finally {
    if (leaseAdmitted) {
      await revokeGrowthWorkerActivation(deadline);
    }
  }
  await requireIdle();
}

async function main() {
  let stage = "IDENTITY";
  try {
    const { source, release } = assertIdentity();
    const day = new Date().toISOString().slice(0, 10);
    stage = "PREFLIGHT";
    await requireIdle();

    const [policy, completedToday, translators] = await Promise.all([
      prisma.growthDailyCadencePreference.findUnique({
        where: { id: "global" },
        select: { pinMode: true, pinMaximum: true },
      }),
      prisma.growthPinCandidate.count({
        where: { createdAt: { gte: new Date(day + "T00:00:00.000Z") } },
      }),
      prisma.translator.findMany({
        where: {
          isActive: true, archivedAt: null,
          slug: { in: [...PREFERRED] },
          growthPinCandidates: { none: {} },
        },
        select: { id: true, slug: true },
      }),
    ]);
    if (policy?.pinMode === "PAUSED") throw Error("OWNER_PAUSED");
    const capacity = Math.min(3, Math.max(0, (policy?.pinMaximum ?? 10) - completedToday));
    const options = [...translators].sort(
      (a, b) => PREFERRED.indexOf(a.slug as typeof PREFERRED[number]) -
        PREFERRED.indexOf(b.slug as typeof PREFERRED[number]),
    );
    if (capacity === 0 || options.length < capacity) {
      throw Error("NO_FRESH_ELIGIBLE_TARGETS");
    }
    console.log("FRESH_CREATIVE_BATCH_TARGETS=" + capacity);
    stage = "GENERATING";
    for (const target of options.slice(0, capacity)) {
      await generateOne(target, source, release, day);
    }
    stage = "POSTCONDITIONS";
    await requireIdle();
    console.log("FRESH_CREATIVE_BATCH=PASSED");
    console.log("FRESH_CREATIVE_COUNT=" + capacity);
    console.log("FRESH_CREATIVE_PROVIDER_CALLS=0");
    console.log("FRESH_CREATIVE_AI_CALLS=0");
    console.log("FRESH_CREATIVE_PIN_PUBLICATIONS=0");
  } catch {
    console.error("FRESH_CREATIVE_BATCH=BLOCKED");
    console.error("FRESH_CREATIVE_STAGE=" + stage);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect().catch(() => { process.exitCode = 1; });
  }
}
void main();
