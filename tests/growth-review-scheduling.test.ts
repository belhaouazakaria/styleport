// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ pending: vi.fn(), native: vi.fn(), sources: vi.fn(), rotation: vi.fn(), policy: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: {
  growthApprovalRequest: { findMany: m.pending }, growthPinPublication: { findMany: m.native },
  growthViralPinTest: { findMany: m.sources }, growthViralProgramSettings: { findUnique: m.policy },
} }));
vi.mock("@/lib/growth/portfolio/daily-rotation-store", () => ({ readDailyRotation: m.rotation }));
vi.mock("@/lib/growth/publishing/service", async () => {
  const { planPublicationTiming } = await import("@/lib/growth/publishing/timing");
  return { recommendPublicationTiming: async (_account: string, stableKey: string, now: Date, collisions: { scheduledAt: Date }[] = []) =>
    planPublicationTiming({ stableKey, now, history: [], collisions }) };
});
import { recommendReviewSchedule } from "@/lib/growth/approvals/scheduling";
import { assertPublicationSpacing } from "@/lib/growth/approvals/spacing";
import { Prisma } from "@prisma/client";
const now = new Date("2026-11-16T08:00:00Z");
beforeEach(() => {
  vi.clearAllMocks(); m.pending.mockResolvedValue([]); m.native.mockResolvedValue([]); m.sources.mockResolvedValue([]);
  m.rotation.mockResolvedValue({ accountId: "account", targetPins: 5, source: 3, original: 2 });
  m.policy.mockResolvedValue({ mode: "ACTIVE", maxPinsPerDay: 5 });
});
it("reserves pending review times across both channels before offering another Pin", async () => {
  const first = await recommendReviewSchedule("account", "first", "SOURCE", now);
  m.pending.mockResolvedValue([{ kind: "SOURCE_PIN", snapshot: { scheduledAt: first.toISOString() } }]);
  const second = await recommendReviewSchedule("account", "first", "NATIVE", now);
  expect(Math.abs(second.getTime() - first.getTime())).toBeGreaterThanOrEqual(90 * 60000);
});
it("honors a source's anchored editorial waiting period", async () => {
  const earliest = new Date("2026-11-18T08:00:00Z");
  expect((await recommendReviewSchedule("account", "source", "SOURCE", now, undefined, earliest)).getTime()).toBeGreaterThanOrEqual(earliest.getTime());
});
it("rechecks both channels under the approval lock", async () => {
  const native = vi.fn().mockResolvedValue(0), source = vi.fn().mockResolvedValue(1);
  const tx = { growthPinPublication: { count: native }, growthViralPinTest: { count: source } } as unknown as Prisma.TransactionClient;
  await expect(assertPublicationSpacing(tx, now)).rejects.toThrow("REVIEW_SCHEDULE_COLLISION");
  source.mockResolvedValue(0);
  await expect(assertPublicationSpacing(tx, now)).resolves.toBeUndefined();
  expect(source).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ scheduledAt: { gt: new Date(now.getTime() - 90 * 60000), lt: new Date(now.getTime() + 90 * 60000) } }) }));
});
