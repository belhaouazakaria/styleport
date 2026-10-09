import { GrowthCreativeArchetype, GrowthCreativeDestinationKind, GrowthJobStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const jobs: Array<Record<string, any>> = [];
  return {
    jobs,
    candidate: null as { id: string; templateId: string } | null,
    translator: {
      id: "translator-1",
      slug: "warm-translator",
      name: "Warm Translator",
      title: "Warm Message Translator",
      subtitle: "Make a message feel warmer.",
      shortDescription: "Rewrite a message with warmth while preserving its meaning.",
      sourceLabel: "Original",
      targetLabel: "Warm rewrite",
      promptSystem: "Rewrite with warmth.",
      promptInstructions: "Preserve meaning.",
      editorialExamples: [],
    },
    enqueue: vi.fn(),
  };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    translator: { findFirst: vi.fn(async () => mocks.translator) },
    growthPinCandidate: {
      findFirst: vi.fn(async () => mocks.candidate),
      findMany: vi.fn(async () => mocks.candidate ? [mocks.candidate] : []),
    },
    growthExperiment: { findUnique: vi.fn() },
    growthJob: {
      findFirst: vi.fn(async ({ where }: { where: { idempotencyKey: { startsWith: string } } }) => {
        const matching = mocks.jobs.filter((job) => String(job.idempotencyKey).startsWith(where.idempotencyKey.startsWith));
        return matching.at(-1) || null;
      }),
    },
  },
}));

vi.mock("@/lib/growth/jobs", () => ({
  enqueueGrowthJob: mocks.enqueue,
}));

import { enqueueCreativeGeneration } from "@/lib/growth/creative/candidates";

const request = {
  targetKind: GrowthCreativeDestinationKind.TRANSLATOR,
  targetId: "translator-1",
  archetype: GrowthCreativeArchetype.BEFORE_AFTER,
  useAiExample: true,
  creativeModelVersion: "creative_lab_v1" as const,
};

describe("Creative Lab manual retry idempotency", () => {
  beforeEach(() => {
    mocks.jobs.length = 0;
    mocks.candidate = null;
    mocks.enqueue.mockReset();
    mocks.enqueue.mockImplementation(async (input: { idempotencyKey: string; maxAttempts: number; payload: { visualVariation: number } }) => {
      const existing = mocks.jobs.find((job) => job.idempotencyKey === input.idempotencyKey);
      if (existing) return { job: existing, created: false };
      const job = {
        id: `job-${mocks.jobs.length + 1}`,
        idempotencyKey: input.idempotencyKey,
        status: GrowthJobStatus.PENDING,
        growthPinCandidate: null,
        maxAttempts: input.maxAttempts,
        payload: input.payload,
      };
      mocks.jobs.push(job);
      return { job, created: true };
    });
  });

  it("converges duplicate clicks and creates one new job after each terminal failure", async () => {
    const first = await enqueueCreativeGeneration(request);
    const duplicate = await enqueueCreativeGeneration(request);
    expect(first.created).toBe(true);
    expect(duplicate).toMatchObject({ created: false, job: { id: first.job.id } });
    expect(mocks.jobs).toHaveLength(1);
    expect(first.job.maxAttempts).toBe(1);

    first.job.status = GrowthJobStatus.FAILED_TERMINAL;
    const retry = await enqueueCreativeGeneration(request);
    const retryDuplicate = await enqueueCreativeGeneration(request);
    expect(retry).toMatchObject({ created: true, job: { maxAttempts: 1 } });
    expect(retry.job.id).not.toBe(first.job.id);
    expect(retryDuplicate).toMatchObject({ created: false, job: { id: retry.job.id } });
    expect(mocks.jobs).toHaveLength(2);

    retry.job.status = GrowthJobStatus.FAILED_TERMINAL;
    const secondRetry = await enqueueCreativeGeneration(request);
    expect(secondRetry).toMatchObject({ created: true, job: { maxAttempts: 1 } });
    expect(secondRetry.job.id).not.toBe(retry.job.id);
    expect(mocks.jobs).toHaveLength(3);
  });

  it("rotates normally after a successful candidate instead of extending the retry chain", async () => {
    const first = await enqueueCreativeGeneration(request);
    first.job.status = GrowthJobStatus.SUCCEEDED;
    first.job.growthPinCandidate = { id: "candidate-1" };
    mocks.candidate = { id: "candidate-1", templateId: "before-after-ai-v1-editorial-split" };

    const next = await enqueueCreativeGeneration(request);
    expect(next.created).toBe(true);
    expect(next.job.payload.creativeDirection).toBe("CHAT_FOCUS");
    expect(next.job.idempotencyKey).not.toContain(":retry:");
    expect(next.job.idempotencyKey).not.toBe(first.job.idempotencyKey);
  });
});
