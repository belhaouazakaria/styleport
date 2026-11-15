// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { countBlockingGrowthJobs } from "@/lib/growth/operations/approved-publication-queue";
const recoveryId = "cmwh23zc8002nxb7xd6j58oy6";
function reader(status = "PENDING", key = "pinterest:analytics-recovery:" + recoveryId, persisted = true) {
  return { growthJob: { findMany: vi.fn().mockResolvedValue([{ id: "job", type: "PINTEREST_ANALYTICS_GAP_RECOVERY", status, attemptCount: 0, runAfter: new Date(), idempotencyKey: key, payload: { recoveryId, batch: 0 } }]) }, growthPinPublication: { findMany: vi.fn().mockResolvedValue([]) }, growthPinterestAnalyticsRecovery: { findMany: vi.fn().mockResolvedValue(persisted ? [{ id: recoveryId }] : []) } };
}
describe("Pending analytics reads cannot starve independent routines", () => {
  it("permits only a persisted, correctly bound read-only continuation", async () => {
    const db = reader();
    expect(await countBlockingGrowthJobs(db as never)).toBe(0);
    expect(await countBlockingGrowthJobs(reader("PENDING", "unbound") as never)).toBe(1);
    expect(await countBlockingGrowthJobs(reader("PENDING", undefined, false) as never)).toBe(1);
  });
  it("still blocks claimed/running readers and every executing worker", async () => {
    expect(await countBlockingGrowthJobs(reader("CLAIMED") as never)).toBe(1);
    expect(await countBlockingGrowthJobs(reader("RUNNING") as never)).toBe(1);
  });
});
