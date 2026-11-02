import { GrowthJobStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { growthJob: { findMany: mock.findMany } } }));

import { requireFreshGrowthCycle } from "@/lib/growth/reporting/daily-runner";

const day = new Date("2026-11-04T05:34:00Z");
const expected = ["strategy", "opportunity", "learning"].map(stage =>
  "growth-cycle-v1:2026-11-04:" + stage);
const completed = expected.map(idempotencyKey =>
  ({ idempotencyKey, status: GrowthJobStatus.SUCCEEDED }));

describe("private digest freshness gate", () => {
  beforeEach(() => mock.findMany.mockReset());

  it("allows a same-day verified three-stage local cycle", async () => {
    mock.findMany.mockResolvedValue(completed);
    await expect(requireFreshGrowthCycle(day)).resolves.toBeUndefined();
    expect(mock.findMany).toHaveBeenCalledWith({
      where: { idempotencyKey: { in: expected } },
      select: { idempotencyKey: true, status: true },
    });
  });

  it("refuses a missing, failed or mismatched cycle rather than a stale digest", async () => {
    for (const rows of [
      completed.slice(0, 2),
      completed.map((x, i) => i === 1 ? { ...x, status: GrowthJobStatus.FAILED_TERMINAL } : x),
      completed.map((x, i) => i === 0
        ? { ...x, idempotencyKey: "growth-cycle-v1:2026-11-03:strategy" } : x),
    ]) {
      mock.findMany.mockResolvedValueOnce(rows);
      await expect(requireFreshGrowthCycle(day))
        .rejects.toThrow("AUTONOMOUS_ANALYSIS_NOT_VERIFIED");
    }
  });
});
