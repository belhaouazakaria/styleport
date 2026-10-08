import { GrowthJobStatus, GrowthJobType, GrowthPinCandidateStatus, type GrowthJob } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock("@/lib/growth/creative/candidates", () => ({ generateCreativeCandidate: mocks.generate }));

import { NonRetryableGrowthJobError } from "@/lib/growth/errors";
import { dispatchGrowthJob } from "@/lib/growth/handlers";

function job(payload: unknown): GrowthJob {
  return { id: "job", type: GrowthJobType.CREATIVE_LAB_GENERATE, status: GrowthJobStatus.RUNNING, payload: payload as never, idempotencyKey: "creative-job", runAfter: new Date(), attemptCount: 1, maxAttempts: 3, workerId: "worker", claimedAt: new Date(), leaseUntil: new Date(), heartbeatAt: new Date(), lastError: null, createdAt: new Date(), updatedAt: new Date(), completedAt: null };
}

describe("Phase 10 Creative Lab handler", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.generate.mockResolvedValue({ candidate: { id: "candidate", status: GrowthPinCandidateStatus.READY, archetype: "TYPOGRAPHY_LED" }, asset: { id: "asset" }, reused: false }); });
  it("dispatches one strict bounded generation job", async () => {
    const payload = { targetKind: "TRANSLATOR", targetId: "translator", archetype: "TYPOGRAPHY_LED", creativeModelVersion: "creative_lab_v1" };
    await expect(dispatchGrowthJob(job(payload))).resolves.toMatchObject({ candidateId: "candidate", assetId: "asset", status: "READY" });
    expect(mocks.generate).toHaveBeenCalledWith(payload, "job");
  });
  it("rejects arbitrary paths, URLs, HTML, and publication fields", async () => {
    await expect(dispatchGrowthJob(job({ targetKind: "TRANSLATOR", targetId: "translator", archetype: "TYPOGRAPHY_LED", creativeModelVersion: "creative_lab_v1", filePath: "/tmp/x", imageUrl: "https://evil.test/x", html: "<b>x</b>", approved: true }))).rejects.toBeInstanceOf(NonRetryableGrowthJobError);
    expect(mocks.generate).not.toHaveBeenCalled();
  });
});

