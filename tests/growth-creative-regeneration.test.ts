import { GrowthCreativeArchetype, GrowthCreativeDestinationKind, GrowthCreativeSimilarityClassification, GrowthJobStatus, GrowthPinCandidateStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  jobs: [] as Array<Record<string, any>>,
  recent: [] as Array<{ id: string; templateId: string }>,
  source: null as Record<string, any> | null,
  enqueue: vi.fn(),
  activity: vi.fn(),
  translator: {
    id: "translator-1", slug: "warm-translator", name: "Warm Translator", title: "Warm Translator", subtitle: "Warm words",
    shortDescription: "Rewrite a message warmly while preserving meaning.", sourceLabel: "Original", targetLabel: "Warm rewrite",
    promptSystem: "Rewrite warmly.", promptInstructions: "Preserve meaning.", editorialExamples: [],
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: {
  translator: { findFirst: vi.fn(async () => mocks.translator) },
  growthPinCandidate: {
    findUnique: vi.fn(async () => mocks.source),
    findMany: vi.fn(async () => mocks.recent),
  },
  growthJob: { findFirst: vi.fn(async ({ where }: any) => mocks.jobs.filter((job) => String(job.idempotencyKey).startsWith(where.idempotencyKey.startsWith)).at(-1) || null) },
} }));
vi.mock("@/lib/growth/jobs", () => ({ enqueueGrowthJob: mocks.enqueue }));
vi.mock("@/lib/growth/activity", () => ({ recordGrowthActivity: mocks.activity }));

import { enqueueCreativeRegeneration } from "@/lib/growth/creative/candidates";

function deferred(archetype = GrowthCreativeArchetype.BEFORE_AFTER) {
  return {
    id: "source", status: GrowthPinCandidateStatus.DEFERRED, similarityResult: GrowthCreativeSimilarityClassification.EXACT_DUPLICATE,
    similarityFlags: { matchedCandidateId: "matched" }, destinationKind: GrowthCreativeDestinationKind.TRANSLATOR,
    translatorId: "translator-1", ideaId: null, archetype, accountId: null, generationJob: null,
    templateId: archetype === GrowthCreativeArchetype.BEFORE_AFTER ? "before-after-ai-v1-editorial-split" : "minimal-poster-v2-layout-1",
  };
}

describe("Creative Lab reason-aware regeneration", () => {
  beforeEach(() => {
    mocks.jobs.length = 0; mocks.recent.length = 0; mocks.activity.mockReset(); mocks.source = deferred();
    mocks.enqueue.mockReset().mockImplementation(async (input: any) => {
      const existing = mocks.jobs.find((job) => job.idempotencyKey === input.idempotencyKey);
      if (existing) return { job: existing, created: false };
      const job = { id: `job-${mocks.jobs.length + 1}`, status: GrowthJobStatus.PENDING, growthPinCandidate: null, ...input };
      mocks.jobs.push(job); return { job, created: true };
    });
  });

  it("excludes exact source/match directions, converges clicks, and permits explicit terminal retry", async () => {
    mocks.recent.push(
      { id: "source", templateId: "before-after-ai-v1-editorial-split" },
      { id: "matched", templateId: "before-after-ai-v1-chat-focus" },
    );
    const first = await enqueueCreativeRegeneration({ candidateId: "source" });
    const duplicate = await enqueueCreativeRegeneration({ candidateId: "source" });
    expect(first).toMatchObject({ created: true, job: { maxAttempts: 1, payload: { creativeDirection: "BOLD_POSTER", regenerationReason: "EXACT_DUPLICATE" } } });
    expect(duplicate).toMatchObject({ created: false, job: { id: first.job.id } });
    first.job.status = GrowthJobStatus.FAILED_TERMINAL;
    const retry = await enqueueCreativeRegeneration({ candidateId: "source" });
    expect(retry).toMatchObject({ created: true, job: { maxAttempts: 1 } });
    expect(retry.job.idempotencyKey).toContain(":retry:");
    expect(mocks.activity).toHaveBeenCalledWith(expect.objectContaining({ action: "CREATIVE_REGENERATION_REQUESTED", summary: expect.objectContaining({ selectedTemplate: "before-after-ai-v1-bold-poster" }) }));
    expect(JSON.stringify(mocks.activity.mock.calls)).not.toContain("Rewrite warmly");
  });

  it("chooses a new direction after success and handles near duplicate reasoning", async () => {
    mocks.source = { ...deferred(), similarityResult: GrowthCreativeSimilarityClassification.NEAR_DUPLICATE };
    mocks.recent.push({ id: "source", templateId: "before-after-ai-v1-editorial-split" }, { id: "matched", templateId: "before-after-ai-v1-chat-focus" });
    const first = await enqueueCreativeRegeneration({ candidateId: "source" });
    mocks.recent.unshift({ id: "generated", templateId: "before-after-ai-v1-bold-poster" });
    const next = await enqueueCreativeRegeneration({ candidateId: "source" });
    expect(first.job.payload).toMatchObject({ creativeDirection: "BOLD_POSTER", regenerationReason: "NEAR_DUPLICATE" });
    expect(next.job.payload.creativeDirection).toBe("COLLAGE");
    expect(next.job.id).not.toBe(first.job.id);
  });

  it("fails clearly when the deterministic Minimal pool is exhausted", async () => {
    mocks.source = deferred(GrowthCreativeArchetype.MINIMAL_STATEMENT);
    mocks.recent.push(
      { id: "source", templateId: "minimal-poster-v2-layout-1" },
      { id: "two", templateId: "minimal-poster-v2-layout-2" },
      { id: "three", templateId: "minimal-poster-v2-layout-3" },
    );
    await expect(enqueueCreativeRegeneration({ candidateId: "source" })).rejects.toThrow("All deterministic Minimal Poster variations");
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });
});
