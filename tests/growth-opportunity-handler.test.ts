import {
  GrowthJobStatus,
  GrowthJobType,
  GrowthOpportunityEvidenceQuality,
  type GrowthJob,
} from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ persist: vi.fn() }));
vi.mock("@/lib/growth/opportunity/analysis", () => ({
  persistOpportunityAnalysis: mocks.persist,
}));
import { dispatchGrowthJob } from "@/lib/growth/handlers";
import { NonRetryableGrowthJobError } from "@/lib/growth/errors";
function job(payload: unknown): GrowthJob {
  return {
    id: "job",
    type: GrowthJobType.OPPORTUNITY_INTELLIGENCE_ANALYSIS,
    status: GrowthJobStatus.RUNNING,
    payload: payload as never,
    idempotencyKey:
      "opportunity-intelligence:opportunity_intelligence_v1:2026-10-06",
    runAfter: new Date(),
    attemptCount: 1,
    maxAttempts: 3,
    workerId: "worker",
    claimedAt: new Date(),
    leaseUntil: new Date(),
    heartbeatAt: new Date(),
    lastError: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    completedAt: null,
  };
}
describe("Phase 7 worker handler", () => {
  beforeEach(() => {
    mocks.persist.mockReset();
    mocks.persist.mockResolvedValue({
      run: {
        id: "run",
        intelligenceModelVersion: "opportunity_intelligence_v1",
        evidenceQuality: GrowthOpportunityEvidenceQuality.KNOWN,
        pinsConsidered: 12,
        opportunitiesProduced: 2,
      },
      created: true,
    });
  });
  it("dispatches the strict Phase 7 payload without a Pinterest call", async () => {
    const result = await dispatchGrowthJob(
      job({
        analysisDate: "2026-10-06",
        modelVersion: "opportunity_intelligence_v1",
      }),
    );
    expect(mocks.persist).toHaveBeenCalledWith({
      analysisDate: new Date("2026-10-06T00:00:00Z"),
      evidenceWindowStart: new Date("2026-09-08T00:00:00Z"),
      evidenceWindowEnd: new Date("2026-10-05T00:00:00Z"),
    });
    expect(result).toMatchObject({ analysisRunId: "run", opportunities: 2 });
  });
  it("rejects mass-assigned or wrong-version payloads as terminal", async () => {
    await expect(
      dispatchGrowthJob(
        job({
          analysisDate: "2026-10-06",
          modelVersion: "other",
          url: "https://api.pinterest.com",
        }),
      ),
    ).rejects.toBeInstanceOf(NonRetryableGrowthJobError);
    expect(mocks.persist).not.toHaveBeenCalled();
  });
});
