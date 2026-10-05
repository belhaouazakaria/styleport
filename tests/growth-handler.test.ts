import { describe, expect, it } from "vitest";

import { GrowthJobStatus, GrowthJobType, type GrowthJob } from "@prisma/client";

import { dispatchGrowthJob } from "@/lib/growth/handlers";

function job(type: GrowthJobType): GrowthJob {
  const now = new Date();
  return {
    id: "job",
    type,
    status: GrowthJobStatus.RUNNING,
    payload: {},
    idempotencyKey: "test",
    runAfter: now,
    attemptCount: 1,
    maxAttempts: 3,
    workerId: "worker",
    claimedAt: now,
    leaseUntil: now,
    heartbeatAt: now,
    lastError: null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  };
}

describe("Growth handler registry", () => {
  it("handles the foundation no-op", async () => {
    await expect(dispatchGrowthJob(job(GrowthJobType.FOUNDATION_NOOP))).resolves.toEqual({ handled: true, type: GrowthJobType.FOUNDATION_NOOP });
  });

  it("fails visibly for an unsupported job type", async () => {
    await expect(dispatchGrowthJob(job("UNKNOWN" as GrowthJobType))).rejects.toThrow("Unsupported Growth job type");
  });
});
