import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  enqueueCreativeGeneration: vi.fn(),
  dispatchGrowthJob: vi.fn(),
  claimGrowthJobs: vi.fn(),
  completeGrowthJob: vi.fn(),
  failGrowthJob: vi.fn(),
  markGrowthJobRunning: vi.fn(),
  countBlockingGrowthJobs: vi.fn(),
  getGrowthPublishingOverview: vi.fn(),
  readDailyRotation: vi.fn(),
  revokeGrowthWorkerActivation: vi.fn(),
  getServerEnv: vi.fn(),
  prisma: {
    growthPinCandidate: { findMany: vi.fn(), findUnique: vi.fn() },
    growthJob: { findMany: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn() },
    growthDailyCadencePreference: { findUnique: vi.fn() },
    translator: { findMany: vi.fn() },
    growthSettings: { findUnique: vi.fn(), updateMany: vi.fn() },
  },
}));

vi.mock("@/lib/growth/creative/candidates", () => ({
  enqueueCreativeGeneration: mocks.enqueueCreativeGeneration,
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
vi.mock("@/lib/growth/overview", () => ({
  getGrowthPublishingOverview: mocks.getGrowthPublishingOverview,
}));
vi.mock("@/lib/growth/portfolio/daily-rotation-store", () => ({
  readDailyRotation: mocks.readDailyRotation,
}));
vi.mock("@/lib/growth/settings", () => ({
  revokeGrowthWorkerActivation: mocks.revokeGrowthWorkerActivation,
}));
vi.mock("@/lib/env", () => ({ getServerEnv: mocks.getServerEnv }));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));

import { GrowthJobStatus, GrowthJobType } from "@prisma/client";
import { requestDailyPinGapFill } from "@/lib/growth/portfolio/request-daily-pin-gap-fill";

describe("manual daily SayTwist Pin gap fill", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readDailyRotation.mockResolvedValue({
      accountId: "saytwist",
      original: 1,
    });
    mocks.getGrowthPublishingOverview.mockResolvedValue({
      nativeCap: 1,
      nativeAllocated: 0,
    });
    mocks.prisma.growthPinCandidate.findMany.mockResolvedValue([]);
    mocks.prisma.growthJob.findMany.mockResolvedValue([]);
    mocks.prisma.growthDailyCadencePreference.findUnique.mockResolvedValue({
      newTranslatorPins: 1,
      existingTranslatorPins: 2,
    });
    mocks.prisma.translator.findMany.mockResolvedValue([
      {
        id: "new-translator",
        slug: "new-translator",
        shortDescription: "A distinct translator with a useful description.",
        createdAt: new Date("2026-11-20T08:00:00Z"),
        editorialExamples: [
          { originalText: "hello there", transformedText: "good day" },
        ],
        growthPinCandidates: [],
      },
    ]);
    mocks.enqueueCreativeGeneration.mockResolvedValue({
      created: true,
      job: { id: "creative-job-1", status: GrowthJobStatus.PENDING },
    });
    mocks.getServerEnv.mockReturnValue({
      GROWTH_AI_IMAGE_ENABLED: true,
      GROWTH_GENZ_AI_IMAGE_ENABLED: true,
      GROWTH_OPENAI_IMAGE_MODEL: "gpt-image-2",
      GROWTH_OPENAI_API_KEY: "sk-test_growth_project_123456",
      GROWTH_OPENAI_PROJECT_ID: "proj_test_123456",
    });
    mocks.prisma.growthSettings.findUnique.mockResolvedValue({
      enabled: false,
      attributionEnabled: false,
      workerActivationExpiresAt: null,
    });
    mocks.countBlockingGrowthJobs.mockResolvedValue(0);
    mocks.prisma.growthSettings.updateMany.mockResolvedValue({ count: 1 });
    mocks.claimGrowthJobs.mockResolvedValue([
      {
        id: "creative-job-1",
        type: GrowthJobType.CREATIVE_LAB_GENERATE,
        status: GrowthJobStatus.CLAIMED,
      },
    ]);
    mocks.dispatchGrowthJob.mockResolvedValue({ candidateId: "candidate-1" });
    mocks.prisma.growthJob.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.growthJob.findUnique.mockResolvedValue({
      status: GrowthJobStatus.SUCCEEDED,
    });
    mocks.prisma.growthPinCandidate.findUnique.mockResolvedValue({
      status: "READY",
      translatorId: "new-translator",
    });
  });

  it("runs only the exact creative job and reports a ready draft for owner review", async () => {
    const result = await requestDailyPinGapFill(
      new Date("2026-11-20T12:00:00Z"),
    );

    expect(result).toMatchObject({
      status: "READY_FOR_REVIEW",
      created: 1,
      gap: 0,
    });
    expect(mocks.claimGrowthJobs).toHaveBeenCalledWith({
      workerId: "manual-gap-fill:creative-job-1",
      jobId: "creative-job-1",
      limit: 1,
      allowedTypes: [GrowthJobType.CREATIVE_LAB_GENERATE],
    });
    expect(mocks.dispatchGrowthJob).toHaveBeenCalledTimes(1);
    expect(mocks.revokeGrowthWorkerActivation).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.growthPinCandidate.findUnique).toHaveBeenCalledWith({
      where: { generationJobId: "creative-job-1" },
      select: { status: true, translatorId: true },
    });
  });

  it("does not enqueue work when the required AI image runtime is unavailable", async () => {
    mocks.getServerEnv.mockReturnValue({ GROWTH_AI_IMAGE_ENABLED: false });

    const result = await requestDailyPinGapFill(
      new Date("2026-11-20T12:00:00Z"),
    );

    expect(result.status).toBe("GENERATION_FAILED");
    expect(mocks.dispatchGrowthJob).not.toHaveBeenCalled();
  });
});
