import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isManualGapFillWorkerAvailable: vi.fn(),
  triggerManualGapFillWorker: vi.fn(),
  enqueueCreativeGeneration: vi.fn(),
  getGrowthPublishingOverview: vi.fn(),
  readDailyRotation: vi.fn(),
  prisma: {
    growthPinCandidate: { findMany: vi.fn(), findUnique: vi.fn() },
    growthJob: { findMany: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn() },
    growthDailyCadencePreference: { findUnique: vi.fn() },
    translator: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/growth/portfolio/manual-gap-fill-launcher", () => ({
  isManualGapFillWorkerAvailable: mocks.isManualGapFillWorkerAvailable,
  triggerManualGapFillWorker: mocks.triggerManualGapFillWorker,
}));
vi.mock("@/lib/growth/creative/candidates", () => ({
  enqueueCreativeGeneration: mocks.enqueueCreativeGeneration,
}));
vi.mock("@/lib/growth/overview", () => ({
  getGrowthPublishingOverview: mocks.getGrowthPublishingOverview,
}));
vi.mock("@/lib/growth/portfolio/daily-rotation-store", () => ({
  readDailyRotation: mocks.readDailyRotation,
}));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));

import { GrowthJobStatus } from "@prisma/client";
import { requestDailyPinGapFill } from "@/lib/growth/portfolio/request-daily-pin-gap-fill";

describe("manual daily SayTwist Pin gap fill", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isManualGapFillWorkerAvailable.mockResolvedValue(true);
    mocks.triggerManualGapFillWorker.mockResolvedValue(undefined);
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
      job: {
        id: "creative-job-1",
        status: GrowthJobStatus.PENDING,
        payload: {
          targetKind: "TRANSLATOR",
          targetId: "new-translator",
          accountId: "saytwist",
        },
      },
    });
    mocks.prisma.growthJob.updateMany.mockResolvedValue({ count: 1 });
  });

  it("starts the isolated worker for the exact tagged daily jobs", async () => {
    const result = await requestDailyPinGapFill(
      new Date("2026-11-20T12:00:00Z"),
    );

    expect(result).toMatchObject({
      status: "PROCESSING",
      jobIds: ["creative-job-1"],
      gap: 0,
    });
    expect(mocks.prisma.growthJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "creative-job-1", status: GrowthJobStatus.PENDING },
        data: expect.objectContaining({
          maxAttempts: 1,
          payload: expect.objectContaining({
            targetId: "new-translator",
            manualGapFillRequestId: result.requestId,
            manualGapFillDay: "2026-11-20",
          }),
        }),
      }),
    );
    expect(mocks.triggerManualGapFillWorker).toHaveBeenCalledWith(
      result.requestId,
    );
  });

  it("does not claim or publish a Pin from the web request", async () => {
    await requestDailyPinGapFill(new Date("2026-11-20T12:00:00Z"));

    expect(mocks.enqueueCreativeGeneration).toHaveBeenCalledTimes(1);
    expect(mocks.triggerManualGapFillWorker).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.growthJob.findUnique).not.toHaveBeenCalled();
    expect(mocks.prisma.growthPinCandidate.findUnique).not.toHaveBeenCalled();
  });

  it("does not queue drafts when the isolated credential-bearing worker is missing", async () => {
    mocks.isManualGapFillWorkerAvailable.mockResolvedValue(false);

    const result = await requestDailyPinGapFill(
      new Date("2026-11-20T12:00:00Z"),
    );

    expect(result.status).toBe("GENERATION_FAILED");
    expect(mocks.enqueueCreativeGeneration).not.toHaveBeenCalled();
  });
});
