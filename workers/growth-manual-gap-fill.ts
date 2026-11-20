import {
  GrowthJobStatus,
  GrowthJobType,
  GrowthCreativeDestinationKind,
  GrowthPinCandidateStatus,
} from "@prisma/client";

import { dispatchGrowthJob } from "@/lib/growth/handlers";
import {
  claimGrowthJobs,
  completeGrowthJob,
  failGrowthJob,
  markGrowthJobRunning,
} from "@/lib/growth/jobs";
import { countBlockingGrowthJobs } from "@/lib/growth/operations/approved-publication-queue";
import { readDailyRotation } from "@/lib/growth/portfolio/daily-rotation-store";
import { revokeGrowthWorkerActivation } from "@/lib/growth/settings";
import { prisma } from "@/lib/prisma";

const LEASE_MS = 270_000;
const REQUEST_ID = /^[0-9a-f-]{36}$/i;

export async function runManualGapFillRequest(
  requestId: string,
  now = new Date(),
) {
  if (
    !REQUEST_ID.test(requestId) ||
    process.env.GROWTH_MANUAL_GAP_FILL_ENABLED !== "true" ||
    process.env.GROWTH_WORKER_RUN_ENABLED !== "false" ||
    process.env.GROWTH_ATTRIBUTION_COLLECTION_ENABLED !== "false" ||
    process.env.GROWTH_DAILY_REPORT_SCHEDULE_ENABLED !== "false" ||
    process.env.TELEGRAM_REPORTS_ENABLED !== "false" ||
    process.env.GROWTH_ROLLOUT_MODE !== "OFF" ||
    process.env.APP_BASE_URL !== "https://saytwist.com" ||
    process.env.GROWTH_AI_IMAGE_ENABLED !== "true" ||
    process.env.GROWTH_GENZ_AI_IMAGE_ENABLED !== "true" ||
    process.env.GROWTH_OPENAI_IMAGE_MODEL !== "gpt-image-2" ||
    !/^sk-[A-Za-z0-9_-]{12,}$/.test(process.env.GROWTH_OPENAI_API_KEY || "") ||
    !/^proj_[A-Za-z0-9_-]{3,128}$/.test(
      process.env.GROWTH_OPENAI_PROJECT_ID || "",
    )
  ) {
    throw new Error("MANUAL_GAP_FILL_RUNTIME_INVALID");
  }

  const active = await prisma.growthJob.findMany({
    where: {
      type: GrowthJobType.CREATIVE_LAB_GENERATE,
      status: GrowthJobStatus.PENDING,
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: 100,
  });
  const jobs = active.filter((job) => {
    const payload = job.payload as { manualGapFillRequestId?: unknown } | null;
    return payload?.manualGapFillRequestId === requestId;
  });
  if (!jobs.length || jobs.length > 3)
    throw new Error("MANUAL_GAP_FILL_SCOPE_INVALID");
  const today = new Date(now);
  today.setUTCHours(0, 0, 0, 0);
  const dayKey = today.toISOString().slice(0, 10);
  const rotation = await readDailyRotation(today);
  if (!rotation.accountId || rotation.original <= 0) {
    throw new Error("MANUAL_GAP_FILL_ACCOUNT_NOT_QUALIFIED");
  }
  const jobIds = jobs.map((job) => job.id);

  let completed = 0;
  for (const expected of jobs) {
    const payload = expected.payload as {
      targetKind?: unknown;
      targetId?: unknown;
      accountId?: unknown;
      archetype?: unknown;
      manualGapFillRequestId?: unknown;
      manualGapFillDay?: unknown;
    } | null;
    if (
      expected.type !== GrowthJobType.CREATIVE_LAB_GENERATE ||
      payload?.manualGapFillRequestId !== requestId ||
      payload.manualGapFillDay !== dayKey ||
      payload.targetKind !== GrowthCreativeDestinationKind.TRANSLATOR ||
      typeof payload.targetId !== "string" ||
      typeof payload.accountId !== "string" ||
      payload.accountId !== rotation.accountId ||
      payload.archetype !== "BEFORE_AFTER"
    ) {
      throw new Error("MANUAL_GAP_FILL_JOB_INVALID");
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
      countBlockingGrowthJobs(prisma, jobIds),
    ]);
    if (
      !settings ||
      settings.enabled ||
      settings.attributionEnabled ||
      settings.workerActivationExpiresAt !== null ||
      blockers !== 0
    ) {
      throw new Error("MANUAL_GAP_FILL_GROWTH_NOT_IDLE");
    }

    const deadline = new Date(Date.now() + LEASE_MS);
    const admitted = await prisma.growthSettings.updateMany({
      where: {
        id: "global",
        enabled: false,
        attributionEnabled: false,
        workerActivationExpiresAt: null,
      },
      data: {
        enabled: true,
        workerActivationExpiresAt: deadline,
        configVersion: { increment: 1 },
      },
    });
    if (admitted.count !== 1) throw new Error("MANUAL_GAP_FILL_LEASE_RACE");

    try {
      const workerId = `manual-gap-fill:${requestId}`.slice(0, 191);
      const claimed = await claimGrowthJobs({
        workerId,
        jobId: expected.id,
        limit: 1,
        allowedTypes: [GrowthJobType.CREATIVE_LAB_GENERATE],
      });
      if (claimed.length !== 1 || claimed[0].id !== expected.id) {
        throw new Error("MANUAL_GAP_FILL_EXACT_CLAIM_FAILED");
      }
      const job = claimed[0];
      await markGrowthJobRunning(job, workerId);
      try {
        await completeGrowthJob(job, workerId, await dispatchGrowthJob(job));
      } catch (error) {
        await failGrowthJob(job, workerId, error);
        throw error;
      }
    } finally {
      await revokeGrowthWorkerActivation(deadline);
    }

    const [finished, candidate] = await Promise.all([
      prisma.growthJob.findUnique({
        where: { id: expected.id },
        select: { status: true },
      }),
      prisma.growthPinCandidate.findUnique({
        where: { generationJobId: expected.id },
        select: { status: true, translatorId: true },
      }),
    ]);
    if (
      finished?.status !== GrowthJobStatus.SUCCEEDED ||
      candidate?.status !== GrowthPinCandidateStatus.READY ||
      candidate.translatorId !== payload.targetId
    ) {
      throw new Error("MANUAL_GAP_FILL_DRAFT_NOT_READY");
    }
    completed++;
  }
  if (completed !== jobs.length) throw new Error("MANUAL_GAP_FILL_INCOMPLETE");
  return { completed };
}

async function main() {
  const requestId = process.env.GROWTH_MANUAL_GAP_FILL_REQUEST_ID || "";
  await runManualGapFillRequest(requestId);
}

if (process.env.GROWTH_MANUAL_GAP_FILL_ENTRYPOINT === "true") {
  main()
    .then(() => process.exit(0))
    .catch(() => {
      process.stderr.write("MANUAL_GAP_FILL_FAILED\n");
      process.exit(1);
    });
}
