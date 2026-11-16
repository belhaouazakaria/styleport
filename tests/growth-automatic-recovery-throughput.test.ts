// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ worker: vi.fn(), revoke: vi.fn(), capacity: vi.fn(), blockers: vi.fn(), jobs: vi.fn(), lease: vi.fn() }));
vi.mock("@/lib/prisma", () => {
  const tx = { $queryRaw: vi.fn(), growthSettings: { findUnique: async () => ({ enabled: false, attributionEnabled: false, workerActivationExpiresAt: null }), update: m.lease }, growthJob: { findMany: m.jobs } };
  return { prisma: { $transaction: async (fn: (db: unknown) => unknown) => fn(tx) } };
});
vi.mock("@/lib/growth/worker", () => ({ runGrowthWorker: m.worker }));
vi.mock("@/lib/growth/settings", () => ({ revokeGrowthWorkerActivation: m.revoke }));
vi.mock("@/lib/growth/pinterest/global-budget", () => ({ hasPinterestMaintenanceCapacity: m.capacity }));
vi.mock("@/lib/growth/operations/approved-publication-queue", () => ({ countBlockingGrowthJobs: m.blockers }));
import { runAutomaticAnalyticsRecovery } from "@/lib/growth/pinterest/automatic-recovery";
beforeEach(() => {
  vi.clearAllMocks(); m.capacity.mockResolvedValue(true); m.blockers.mockResolvedValue(0);
  m.jobs.mockImplementation(async () => [{ id: "read-" + m.jobs.mock.calls.length, type: "PINTEREST_ANALYTICS_GAP_RECOVERY", runAfter: new Date(0) }]);
  m.worker.mockResolvedValue({ status: "COMPLETED", succeeded: 1, failed: 0 });
});
afterEach(() => vi.useRealTimers());
it("advances three exact read jobs with separate leases and quota checks", async () => {
  expect(await runAutomaticAnalyticsRecovery()).toMatchObject({ succeeded: 3, failed: 0, batches: 3 });
  expect(m.capacity).toHaveBeenCalledTimes(3); expect(m.revoke).toHaveBeenCalledTimes(3);
  expect(m.worker.mock.calls.map(c => c[0].onlyJobId)).toEqual(["read-1", "read-2", "read-3"]);
  for (const [input] of m.worker.mock.calls) expect(input).toMatchObject({ batchSize: 1, rolloutConfig: { GROWTH_ROLLOUT_MODE: "RECOVER" } });
});
it("does not enter a worker when provider capacity is unavailable", async () => {
  m.capacity.mockResolvedValue(false);
  expect(await runAutomaticAnalyticsRecovery()).toEqual({ status: "NOT_DUE_OR_BUSY" });
  expect(m.worker).not.toHaveBeenCalled(); expect(m.lease).not.toHaveBeenCalled();
});
it("stops after a failed batch and releases its lease", async () => {
  m.worker.mockResolvedValue({ status: "COMPLETED", succeeded: 0, failed: 1 });
  expect(await runAutomaticAnalyticsRecovery()).toMatchObject({ failed: 1 });
  expect(m.worker).toHaveBeenCalledOnce(); expect(m.revoke).toHaveBeenCalledOnce();
});
it("stops after a slow batch rather than overrunning the service deadline", async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-16T18:00:00Z"));
  m.worker.mockImplementation(async () => { vi.setSystemTime(new Date("2026-11-16T18:00:46Z")); return { status: "COMPLETED", succeeded: 1, failed: 0 }; });
  expect(await runAutomaticAnalyticsRecovery()).toMatchObject({ succeeded: 1, batches: 1 });
  expect(m.worker).toHaveBeenCalledOnce();
});
