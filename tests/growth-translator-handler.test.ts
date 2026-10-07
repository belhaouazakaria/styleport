import { GrowthDecisionStatus, GrowthDecisionType, GrowthJobStatus, GrowthJobType, type GrowthJob } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ decide: vi.fn(), execute: vi.fn() }));
vi.mock("@/lib/growth/translator/service", () => ({ decideTranslatorOpportunity: mocks.decide, executeTranslatorDecision: mocks.execute }));

import { NonRetryableGrowthJobError } from "@/lib/growth/errors";
import { dispatchGrowthJob } from "@/lib/growth/handlers";

function job(type: GrowthJobType, payload: unknown): GrowthJob {
  return { id: "job", type, status: GrowthJobStatus.RUNNING, payload: payload as never, idempotencyKey: `key:${type}`, runAfter: new Date(), attemptCount: 1, maxAttempts: 3, workerId: "worker", claimedAt: new Date(), leaseUntil: new Date(), heartbeatAt: new Date(), lastError: null, createdAt: new Date(), updatedAt: new Date(), completedAt: null };
}

describe("Phase 8 worker handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.decide.mockResolvedValue({ decision: { id: "decision", type: GrowthDecisionType.NO_ACTION, status: GrowthDecisionStatus.COMPLETED, decisionModelVersion: "translator_autopilot_v1" }, execution: null });
    mocks.execute.mockResolvedValue({ decision: { id: "decision", status: GrowthDecisionStatus.COMPLETED, translatorId: "translator" }, translatorId: "translator", reused: false });
  });
  it("dispatches strict decision and execution jobs", async () => {
    await dispatchGrowthJob(job(GrowthJobType.TRANSLATOR_AUTOPILOT_DECIDE, { opportunityId: "opportunity", decisionModelVersion: "translator_autopilot_v1" }));
    expect(mocks.decide).toHaveBeenCalledWith("opportunity");
    await dispatchGrowthJob(job(GrowthJobType.TRANSLATOR_AUTOPILOT_EXECUTE, { decisionId: "decision" }));
    expect(mocks.execute).toHaveBeenCalledWith("decision", { jobId: "job" });
  });
  it("rejects arbitrary versions and mass-assigned fields", async () => {
    await expect(dispatchGrowthJob(job(GrowthJobType.TRANSLATOR_AUTOPILOT_DECIDE, { opportunityId: "opportunity", decisionModelVersion: "attacker", translatorId: "invented" }))).rejects.toBeInstanceOf(NonRetryableGrowthJobError);
    await expect(dispatchGrowthJob(job(GrowthJobType.TRANSLATOR_AUTOPILOT_EXECUTE, { decisionId: "decision", snapshot: {} }))).rejects.toBeInstanceOf(NonRetryableGrowthJobError);
    expect(mocks.decide).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });
});

