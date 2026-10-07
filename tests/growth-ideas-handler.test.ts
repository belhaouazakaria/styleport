import { GrowthDecisionStatus, GrowthDecisionType, GrowthJobStatus, GrowthJobType, type GrowthJob } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ decide: vi.fn(), execute: vi.fn() }));
vi.mock("@/lib/growth/ideas/service", () => ({ decideIdeaOpportunity: mocks.decide, executeIdeaDecision: mocks.execute }));

import { NonRetryableGrowthJobError } from "@/lib/growth/errors";
import { dispatchGrowthJob } from "@/lib/growth/handlers";

function job(type: GrowthJobType, payload: unknown): GrowthJob {
  return { id: "job", type, status: GrowthJobStatus.RUNNING, payload: payload as never, idempotencyKey: `key:${type}`, runAfter: new Date(), attemptCount: 1, maxAttempts: 3, workerId: "worker", claimedAt: new Date(), leaseUntil: new Date(), heartbeatAt: new Date(), lastError: null, createdAt: new Date(), updatedAt: new Date(), completedAt: null };
}

describe("Phase 9 worker handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.decide.mockResolvedValue({ decision: { id: "decision", type: GrowthDecisionType.CREATE_IDEA, status: GrowthDecisionStatus.PROPOSED, decisionModelVersion: "idea_autopilot_v1" }, execution: { job: { id: "execute-job" } } });
    mocks.execute.mockResolvedValue({ decision: { id: "decision", status: GrowthDecisionStatus.COMPLETED, ideaId: "idea" }, ideaId: "idea", reused: false });
  });
  it("dispatches strict one-shot decision and execution jobs", async () => {
    await dispatchGrowthJob(job(GrowthJobType.IDEA_AUTOPILOT_DECIDE, { opportunityId: "opportunity", decisionModelVersion: "idea_autopilot_v1" }));
    expect(mocks.decide).toHaveBeenCalledWith("opportunity");
    await dispatchGrowthJob(job(GrowthJobType.IDEA_AUTOPILOT_EXECUTE, { decisionId: "decision" }));
    expect(mocks.execute).toHaveBeenCalledWith("decision", { jobId: "job" });
  });
  it("rejects arbitrary versions, IDs, and generated content in job payloads", async () => {
    await expect(dispatchGrowthJob(job(GrowthJobType.IDEA_AUTOPILOT_DECIDE, { opportunityId: "opportunity", decisionModelVersion: "attacker", ideaId: "invented" }))).rejects.toBeInstanceOf(NonRetryableGrowthJobError);
    await expect(dispatchGrowthJob(job(GrowthJobType.IDEA_AUTOPILOT_EXECUTE, { decisionId: "decision", blocks: [] }))).rejects.toBeInstanceOf(NonRetryableGrowthJobError);
    expect(mocks.decide).not.toHaveBeenCalled(); expect(mocks.execute).not.toHaveBeenCalled();
  });
});

