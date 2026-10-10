import { GrowthJobStatus, GrowthJobType } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ publish: vi.fn(), reconcile: vi.fn() }));
vi.mock("@/lib/growth/publishing/service", () => ({ publishApprovedPin: mocks.publish, reconcilePinterestPublication: mocks.reconcile }));
import { dispatchGrowthJob } from "@/lib/growth/handlers";
function job(type: GrowthJobType, payload: unknown, attemptCount = 1) { return { id: "job", type, status: GrowthJobStatus.RUNNING, payload: payload as never, idempotencyKey: `key:${type}`, runAfter: new Date(), attemptCount, maxAttempts: 4, workerId: "worker", claimedAt: new Date(), leaseUntil: new Date(), heartbeatAt: new Date(), lastError: null, createdAt: new Date(), updatedAt: new Date(), completedAt: null }; }
describe("Phase 11 worker handlers", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.publish.mockResolvedValue({ publication: { id: "publication", status: "RECONCILED" }, reused: false }); mocks.reconcile.mockResolvedValue({ publication: { id: "publication", status: "RECONCILED" }, reused: false }); });
  it("dispatches strict publication and reconciliation payloads", async () => {
    await expect(dispatchGrowthJob(job(GrowthJobType.PINTEREST_PIN_PUBLISH, { publicationId: "publication" }))).resolves.toMatchObject({ publicationId: "publication", status: "RECONCILED" });
    expect(mocks.publish).toHaveBeenCalledWith("publication");
    await expect(dispatchGrowthJob(job(GrowthJobType.PINTEREST_PIN_RECONCILE, { publicationId: "publication" }, 3))).resolves.toMatchObject({ publicationId: "publication" });
    expect(mocks.reconcile).toHaveBeenCalledWith("publication", 3);
    await expect(dispatchGrowthJob(job(GrowthJobType.PINTEREST_PIN_PUBLISH, { publicationId: "publication", url: "https://evil.test" }))).rejects.toThrow("Invalid Pinterest publication payload");
  });
});
