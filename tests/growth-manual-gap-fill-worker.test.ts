import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  dispatchGrowthJob: vi.fn(),
  claimGrowthJobs: vi.fn(),
  completeGrowthJob: vi.fn(),
  failGrowthJob: vi.fn(),
  markGrowthJobRunning: vi.fn(),
  countBlockingGrowthJobs: vi.fn(),
  readDailyRotation: vi.fn(),
  revokeGrowthWorkerActivation: vi.fn(),
  prisma: {
    growthJob: { findMany: vi.fn(), findUnique: vi.fn() },
    growthPinCandidate: { findUnique: vi.fn() },
    growthSettings: { findUnique: vi.fn(), updateMany: vi.fn() },
  },
}));

vi.mock("@/lib/growth/handlers", () => ({
  dispatchGrowthJob: mocks.dispatchGrowthJob,
}));
vi.mock("@/lib/growth/jobs", () => ({
  claimGrowthJobs: mocks.claimGrowthJobs,
  completeGrowthJob: mocks.completeGrowthJob,
  failGrowthJob: mocks.failGrowthJob,
  markGrowthJobRunning: mocks.markGrowthJobRunning,
}));
vi.mock("@/lib/growth/operations/approved-publication-queue", () => ({
  countBlockingGrowthJobs: mocks.countBlockingGrowthJobs,
}));
vi.mock("@/lib/growth/portfolio/daily-rotation-store", () => ({
  readDailyRotation: mocks.readDailyRotation,
}));
vi.mock("@/lib/growth/settings", () => ({
  revokeGrowthWorkerActivation: mocks.revokeGrowthWorkerActivation,
}));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));

import {
  GrowthCreativeDestinationKind,
  GrowthJobStatus,
  GrowthJobType,
  GrowthPinCandidateStatus,
} from "@prisma/client";
import { runManualGapFillRequest } from "@/workers/growth-manual-gap-fill";

const requestId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const job = {
  id: "creative-job-1",
  type: GrowthJobType.CREATIVE_LAB_GENERATE,
  status: GrowthJobStatus.PENDING,
  createdAt: new Date("2026-11-20T12:00:00Z"),
  payload: {
    manualGapFillRequestId: requestId,
    manualGapFillDay: "2026-11-20",
    targetKind: GrowthCreativeDestinationKind.TRANSLATOR,
    targetId: "translator-1",
    accountId: "saytwist",
    archetype: "BEFORE_AFTER",
  },
};

describe("isolated manual Growth gap-fill worker", () => {
  const priorEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(process.env, {
      APP_BASE_URL: "https://saytwist.com",
      GROWTH_MANUAL_GAP_FILL_ENABLED: "true",
      GROWTH_WORKER_RUN_ENABLED: "false",
      GROWTH_ATTRIBUTION_COLLECTION_ENABLED: "false",
      GROWTH_DAILY_REPORT_SCHEDULE_ENABLED: "false",
      TELEGRAM_REPORTS_ENABLED: "false",
      GROWTH_ROLLOUT_MODE: "OFF",
      GROWTH_AI_IMAGE_ENABLED: "true",
      GROWTH_GENZ_AI_IMAGE_ENABLED: "true",
      GROWTH_OPENAI_IMAGE_MODEL: "gpt-image-2",
      GROWTH_OPENAI_API_KEY: "sk-test_growth_project_123456",
      GROWTH_OPENAI_PROJECT_ID: "proj_test_123456",
    });
    mocks.prisma.growthJob.findMany.mockResolvedValue([job]);
    mocks.readDailyRotation.mockResolvedValue({
      accountId: "saytwist",
      original: 3,
    });
    mocks.prisma.growthSettings.findUnique.mockResolvedValue({
      enabled: false,
      attributionEnabled: false,
      workerActivationExpiresAt: null,
    });
    mocks.countBlockingGrowthJobs.mockResolvedValue(0);
    mocks.prisma.growthSettings.updateMany.mockResolvedValue({ count: 1 });
    mocks.claimGrowthJobs.mockResolvedValue([
      { ...job, status: GrowthJobStatus.CLAIMED },
    ]);
    mocks.dispatchGrowthJob.mockResolvedValue({ candidateId: "candidate-1" });
    mocks.prisma.growthJob.findUnique.mockResolvedValue({
      status: GrowthJobStatus.SUCCEEDED,
    });
    mocks.prisma.growthPinCandidate.findUnique.mockResolvedValue({
      status: GrowthPinCandidateStatus.READY,
      translatorId: "translator-1",
    });
  });

  afterEach(() => {
    process.env = { ...priorEnv };
  });

  it("claims and runs only the tagged exact Creative Lab job under a short lease", async () => {
    await expect(
      runManualGapFillRequest(requestId, new Date("2026-11-20T12:00:00Z")),
    ).resolves.toEqual({ completed: 1 });

    expect(mocks.claimGrowthJobs).toHaveBeenCalledWith({
      workerId: `manual-gap-fill:${requestId}`,
      jobId: "creative-job-1",
      limit: 1,
      allowedTypes: [GrowthJobType.CREATIVE_LAB_GENERATE],
    });
    expect(mocks.dispatchGrowthJob).toHaveBeenCalledTimes(1);
    expect(mocks.revokeGrowthWorkerActivation).toHaveBeenCalledTimes(1);
  });

  it("refuses jobs outside today's SayTwist account allocation", async () => {
    mocks.prisma.growthJob.findMany.mockResolvedValue([
      { ...job, payload: { ...job.payload, accountId: "anythingtranslate" } },
    ]);

    await expect(
      runManualGapFillRequest(requestId, new Date("2026-11-20T12:00:00Z")),
    ).rejects.toThrow("MANUAL_GAP_FILL_JOB_INVALID");
    expect(mocks.claimGrowthJobs).not.toHaveBeenCalled();
  });

  it("fails closed when Growth or the AI image scope is disabled", async () => {
    process.env.GROWTH_WORKER_RUN_ENABLED = "true";

    await expect(
      runManualGapFillRequest(requestId, new Date("2026-11-20T12:00:00Z")),
    ).rejects.toThrow("MANUAL_GAP_FILL_RUNTIME_INVALID");
    expect(mocks.claimGrowthJobs).not.toHaveBeenCalled();
  });
});
