import { randomUUID } from "node:crypto";
import {
  GrowthAiOperationKind,
  GrowthJobStatus,
  GrowthJobType,
  GrowthCreativeArchetype,
  GrowthCreativeDestinationKind,
} from "@prisma/client";

import { enqueueCreativeGeneration } from "@/lib/growth/creative/candidates";
import { CREATIVE_LAB_VERSION } from "@/lib/growth/creative/constants";
import { getGrowthPublishingOverview } from "@/lib/growth/overview";
import {
  isManualGapFillWorkerAvailable,
  triggerManualGapFillWorker,
} from "@/lib/growth/portfolio/manual-gap-fill-launcher";
import { readDailyRotation } from "@/lib/growth/portfolio/daily-rotation-store";
import { prisma } from "@/lib/prisma";
import { growthBudgetUtcWindows } from "@/lib/growth/economics/budget-policy";
import { diversifyTargets } from "@/lib/growth/viral/target-diversity";

const MIN_DESCRIPTION_LENGTH = 40;
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

  if (!(await isManualGapFillWorkerAvailable())) {
    return {
      status: "GENERATION_FAILED" as const,
      created: 0,
      gap: scheduledGap,
      available: 0,
      errors: [
        "The isolated Growth worker is not installed or is out of date.",
      ],
    };
  }

  // Say plainly when today's AI image allowance is used up, instead of
  // queueing a job that can only fail on the spending limit.
  try {
    const { dayStart } = growthBudgetUtcWindows(now);
    const [settings, usedImages] = await Promise.all([
      prisma.growthSettings.findUnique({
        where: { id: "global" },
        select: { aiImagesPerDayCap: true },
      }),
      prisma.growthAiBudgetReservation.count({
        where: { createdAt: { gte: dayStart }, kind: GrowthAiOperationKind.IMAGE },
      }),
    ]);
    if (settings && usedImages >= settings.aiImagesPerDayCap) {
      return {
        status: "GENERATION_FAILED" as const,
        created: 0,
        gap: scheduledGap,
        available: 0,
        errors: [
          `Today's AI image limit is reached (${usedImages} of ${settings.aiImagesPerDayCap}, resets at 00:00 UTC). Approve the ready designs, or raise the limit in Growth settings.`,
        ],
      };
    }
  } catch {
    // Never let this advisory check block a normal request.
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
  // Spread themes: a theme promoted in the last two weeks waits, and no theme
  // repeats until the others had a turn.
  let spreadExisting = existingTargets;
  try {
    const recent = await prisma.growthPinCandidate.findMany({
      where: {
        createdAt: { gte: new Date(day.getTime() - 14 * 86_400_000) },
        translatorId: { not: null },
      },
      select: { translator: { select: { slug: true } } },
      take: 200,
    });
    spreadExisting = diversifyTargets(
      existingTargets,
      recent.flatMap((row) => (row.translator?.slug ? [row.translator.slug] : [])),
    );
  } catch {
    spreadExisting = existingTargets;
  }
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
    ...spreadExisting.slice(0, existingTargetCount),
  ];

  const requestId = randomUUID();
  const dayKey = day.toISOString().slice(0, 10);
  const jobIds: string[] = [];
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
      if (
        candidate?.status !== "READY" ||
        candidate.translatorId !== target.id
      ) {
        errors.push("An existing Pin job has no matching ready design.");
      }
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
        data: {
          maxAttempts: 1,
          payload: {
            ...(result.job.payload as Record<string, unknown>),
            manualGapFillRequestId: requestId,
            manualGapFillDay: dayKey,
          },
        },
      });
    } else {
      await prisma.growthJob.updateMany({
        where: { id: result.job.id, status: GrowthJobStatus.PENDING },
        data: {
          payload: {
            ...(result.job.payload as Record<string, unknown>),
            manualGapFillRequestId: requestId,
            manualGapFillDay: dayKey,
          },
        },
      });
    }
    jobIds.push(result.job.id);
  }

  if (!jobIds.length) {
    return {
      status: errors.length
        ? ("GENERATION_FAILED" as const)
        : ("NO_QUALIFIED_TARGET" as const),
      created: 0,
      gap: scheduledGap,
      available: readyForReview + inFlight,
      errors,
    };
  }

  try {
    await triggerManualGapFillWorker(requestId);
  } catch {
    return {
      status: "GENERATION_FAILED" as const,
      created: 0,
      gap: scheduledGap,
      available: readyForReview + inFlight,
      errors: [
        "The isolated Growth worker is unavailable; no designs were sent for generation.",
      ],
    };
  }

  const remainingGap = Math.max(
    0,
    scheduledGap - readyForReview - inFlight - jobIds.length,
  );
  return {
    status: "PROCESSING" as const,
    requestId,
    jobIds,
    gap: remainingGap,
    available: readyForReview + inFlight,
    errors,
  };
}
