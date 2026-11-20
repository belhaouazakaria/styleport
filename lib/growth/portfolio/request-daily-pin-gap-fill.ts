import {
  GrowthJobStatus,
  GrowthJobType,
  GrowthCreativeArchetype,
  GrowthCreativeDestinationKind,
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
import { countBlockingGrowthJobs } from "@/lib/growth/operations/approved-publication-queue";
import { getGrowthPublishingOverview } from "@/lib/growth/overview";
import { readDailyRotation } from "@/lib/growth/portfolio/daily-rotation-store";
import { revokeGrowthWorkerActivation } from "@/lib/growth/settings";
import { getServerEnv } from "@/lib/env";
import { prisma } from "@/lib/prisma";

const MIN_DESCRIPTION_LENGTH = 40;
const LEASE_MS = 270_000;

async function generateExactDraft(jobId: string, translatorId: string) {
  const env = getServerEnv();
  if (
    env.GROWTH_AI_IMAGE_ENABLED !== true ||
    env.GROWTH_GENZ_AI_IMAGE_ENABLED !== true ||
    env.GROWTH_OPENAI_IMAGE_MODEL !== "gpt-image-2" ||
    !/^sk-[A-Za-z0-9_-]{12,}$/.test(env.GROWTH_OPENAI_API_KEY || "") ||
    !/^proj_[A-Za-z0-9_-]{3,128}$/.test(env.GROWTH_OPENAI_PROJECT_ID || "")
  ) {
    throw new Error(
      "Growth image generation is not configured for a real draft run.",
    );
  }
  const [settings, blockers] = await Promise.all([
    prisma.growthSettings.findUnique({
      where: { id: "global" },
      select: {
        enabled: true,
        attributionEnabled: true,
        workerActivationExpiresAt: true,
      },
    }),
    countBlockingGrowthJobs(prisma, [jobId]),
  ]);
  if (
    !settings ||
    settings.enabled ||
    settings.attributionEnabled ||
    settings.workerActivationExpiresAt ||
    blockers !== 0
  ) {
    throw new Error(
      "Growth is busy; retry the gap fill after its current work finishes.",
    );
  }
  const leaseUntil = new Date(Date.now() + LEASE_MS);
  const admitted = await prisma.growthSettings.updateMany({
    where: {
      id: "global",
      enabled: false,
      attributionEnabled: false,
      workerActivationExpiresAt: null,
    },
    data: {
      enabled: true,
      workerActivationExpiresAt: leaseUntil,
      configVersion: { increment: 1 },
    },
  });
  if (admitted.count !== 1)
    throw new Error("Growth activation changed before draft generation.");
  try {
    const workerId = `manual-gap-fill:${jobId}`;
    const jobs = await claimGrowthJobs({
      workerId,
      jobId,
      limit: 1,
      allowedTypes: [GrowthJobType.CREATIVE_LAB_GENERATE],
    });
    if (
      jobs.length !== 1 ||
      jobs[0].id !== jobId ||
      jobs[0].type !== GrowthJobType.CREATIVE_LAB_GENERATE
    ) {
      throw new Error("Could not claim the exact Pin draft job.");
    }
    const job = jobs[0];
    await markGrowthJobRunning(job, workerId);
    try {
      await completeGrowthJob(job, workerId, await dispatchGrowthJob(job));
    } catch (error) {
      await failGrowthJob(job, workerId, error);
      throw error;
    }
  } finally {
    await revokeGrowthWorkerActivation(leaseUntil);
  }
  const [job, candidate] = await Promise.all([
    prisma.growthJob.findUnique({
      where: { id: jobId },
      select: { status: true },
    }),
    prisma.growthPinCandidate.findUnique({
      where: { generationJobId: jobId },
      select: { status: true, translatorId: true },
    }),
  ]);
  if (
    job?.status !== GrowthJobStatus.SUCCEEDED ||
    candidate?.status !== "READY" ||
    candidate.translatorId !== translatorId
  ) {
    throw new Error("Draft generation did not produce a ready Pin for review.");
  }
}

/**
 * Queue only today's missing SayTwist creative drafts. Every result remains a
 * draft for owner review; this function never approves or publishes a Pin.
 */
export async function requestDailyPinGapFill(now = new Date()) {
  const day = new Date(now);
  day.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(day.getTime() + 86_400_000);
  const rotation = await readDailyRotation(day);
  if (!rotation.accountId || rotation.original <= 0) {
    return {
      status: "NO_NATIVE_ALLOCATION" as const,
      created: 0,
      gap: 0,
      available: 0,
    };
  }

  const overview = await getGrowthPublishingOverview(now);
  const scheduledGap = Math.max(
    0,
    overview.nativeCap - overview.nativeAllocated,
  );
  if (!scheduledGap) {
    return {
      status: "ALREADY_FULL" as const,
      created: 0,
      gap: 0,
      available: 0,
    };
  }

  const imageEnv = getServerEnv();
  if (
    imageEnv.GROWTH_AI_IMAGE_ENABLED !== true ||
    imageEnv.GROWTH_GENZ_AI_IMAGE_ENABLED !== true ||
    imageEnv.GROWTH_OPENAI_IMAGE_MODEL !== "gpt-image-2" ||
    !/^sk-[A-Za-z0-9_-]{12,}$/.test(imageEnv.GROWTH_OPENAI_API_KEY || "") ||
    !/^proj_[A-Za-z0-9_-]{3,128}$/.test(imageEnv.GROWTH_OPENAI_PROJECT_ID || "")
  ) {
    return {
      status: "GENERATION_FAILED" as const,
      created: 0,
      gap: scheduledGap,
      available: 0,
      errors: [
        "Growth image generation is not configured for a real draft run.",
      ],
    };
  }

  const [
    readyCandidates,
    activeCreativeJobs,
    dailyPreference,
    translatorsCreatedToday,
  ] = await Promise.all([
    prisma.growthPinCandidate.findMany({
      where: {
        accountId: rotation.accountId,
        status: "READY",
        approvals: { none: { status: "APPROVED" } },
      },
      select: { id: true },
      take: 20,
    }),
    prisma.growthJob.findMany({
      where: {
        type: GrowthJobType.CREATIVE_LAB_GENERATE,
        status: {
          in: [
            GrowthJobStatus.PENDING,
            GrowthJobStatus.CLAIMED,
            GrowthJobStatus.RUNNING,
          ],
        },
      },
      select: { id: true, payload: true },
      take: 100,
    }),
    prisma.growthDailyCadencePreference.findUnique({
      where: { id: "global" },
      select: { newTranslatorPins: true, existingTranslatorPins: true },
    }),
    prisma.translator.findMany({
      where: {
        isActive: true,
        archivedAt: null,
        createdAt: { gte: day, lt: dayEnd },
      },
      select: { id: true },
    }),
  ]);

  const inFlightTargetIds = new Set(
    activeCreativeJobs.flatMap((job) => {
      const payload = job.payload as {
        targetKind?: unknown;
        targetId?: unknown;
        accountId?: unknown;
      } | null;
      return payload?.targetKind === "TRANSLATOR" &&
        payload.accountId === rotation.accountId &&
        typeof payload.targetId === "string"
        ? [payload.targetId]
        : [];
    }),
  );
  const readyForReview = readyCandidates.length;
  const inFlight = inFlightTargetIds.size;
  const remaining = Math.max(0, scheduledGap - readyForReview - inFlight);
  if (!remaining) {
    return {
      status: "ALREADY_IN_REVIEW_OR_PREPARATION" as const,
      created: 0,
      gap: scheduledGap,
      available: readyForReview + inFlight,
    };
  }

  const targets = await prisma.translator.findMany({
    where: {
      isActive: true,
      archivedAt: null,
      editorialExamples: { some: {} },
      growthPinCandidates: {
        none: {
          accountId: rotation.accountId,
          createdAt: { gte: day, lt: dayEnd },
          status: { not: "CANCELLED" },
        },
      },
    },
    select: {
      id: true,
      slug: true,
      shortDescription: true,
      createdAt: true,
      editorialExamples: {
        select: { originalText: true, transformedText: true },
        orderBy: { sortOrder: "asc" },
        take: 1,
      },
      growthPinCandidates: {
        where: { accountId: rotation.accountId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 1,
        select: { createdAt: true },
      },
    },
    orderBy: [{ createdAt: "desc" }, { slug: "asc" }],
    take: 500,
  });
  const eligible = targets.filter(
    (target) =>
      target.shortDescription.trim().length >= MIN_DESCRIPTION_LENGTH &&
      (target.editorialExamples[0]?.originalText.trim().length ?? 0) >= 8 &&
      (target.editorialExamples[0]?.transformedText.trim().length ?? 0) >= 8 &&
      !inFlightTargetIds.has(target.id),
  );
  const newIds = new Set(
    translatorsCreatedToday.map((translator) => translator.id),
  );
  const newTargets = eligible.filter((target) => newIds.has(target.id));
  const existingTargets = eligible
    .filter((target) => !newIds.has(target.id))
    .sort(
      (a, b) =>
        (a.growthPinCandidates[0]?.createdAt.getTime() ?? 0) -
        (b.growthPinCandidates[0]?.createdAt.getTime() ?? 0),
    );
  const newTargetCount = Math.min(
    dailyPreference?.newTranslatorPins ?? 1,
    remaining,
  );
  const existingTargetCount = Math.min(
    dailyPreference?.existingTranslatorPins ?? 2,
    Math.max(0, remaining - newTargetCount),
  );
  // Preserve the configured new/existing mix when those target classes exist;
  // an unmet new-translator target is reported as a remaining gap, not silently
  // substituted with an unrelated translator.
  const selected = [
    ...newTargets.slice(0, newTargetCount),
    ...existingTargets.slice(0, existingTargetCount),
  ];

  let created = 0;
  const errors: string[] = [];
  for (const target of selected) {
    const result = await enqueueCreativeGeneration(
      {
        targetKind: GrowthCreativeDestinationKind.TRANSLATOR,
        targetId: target.id,
        archetype: GrowthCreativeArchetype.BEFORE_AFTER,
        useAiExample: false,
        accountId: rotation.accountId,
        creativeModelVersion: CREATIVE_LAB_VERSION,
      },
      {
        useAccountDefaultStyle: true,
        idempotencyScope: `manual-daily-pin-gap:${day.toISOString().slice(0, 10)}:${target.slug}`,
      },
    );
    if (result.job.status === GrowthJobStatus.SUCCEEDED) {
      const candidate = await prisma.growthPinCandidate.findUnique({
        where: { generationJobId: result.job.id },
        select: { status: true, translatorId: true },
      });
      if (candidate?.status === "READY" && candidate.translatorId === target.id)
        created++;
      continue;
    }
    if (result.job.status !== GrowthJobStatus.PENDING) {
      errors.push(
        "An existing Pin draft job is already in progress or needs attention.",
      );
      break;
    }
    if (result.created) {
      await prisma.growthJob.updateMany({
        where: { id: result.job.id, status: GrowthJobStatus.PENDING },
        data: { maxAttempts: 1 },
      });
    }
    try {
      await generateExactDraft(result.job.id, target.id);
      created++;
    } catch (error) {
      errors.push(
        error instanceof Error ? error.message : "Pin draft generation failed.",
      );
      break;
    }
  }

  const remainingGap = Math.max(
    0,
    scheduledGap - readyForReview - inFlight - created,
  );
  return {
    status: created
      ? ("READY_FOR_REVIEW" as const)
      : errors.length
        ? ("GENERATION_FAILED" as const)
        : ("NO_QUALIFIED_TARGET" as const),
    created,
    gap: remainingGap,
    available: readyForReview + inFlight,
    errors,
  };
}
