import { GrowthJobStatus, GrowthJobType } from "@prisma/client";
import { afterAll, describe, expect, it, vi } from "vitest";

import { prisma } from "@/lib/prisma";
import { executeAutonomousGrowthCycle } from "@/workers/growth-autonomous-cycle";

const enabled = process.env.RUN_GROWTH_CYCLE_DB_TESTS === "1";
const suite = enabled ? describe.sequential : describe.skip;
const NAME = "saytwist_growth_phase14i_cycle_test";

if (enabled) {
  const actual = process.env.DATABASE_URL;
  const permitted = process.env.GROWTH_CYCLE_TEST_DATABASE_URL;
  if (!actual || !permitted || actual !== permitted) {
    throw Error("Phase14I E2E requires an exact separate disposable test database URL.");
  }
  const target = new URL(actual);
  if (!["127.0.0.1", "localhost", "::1"].includes(target.hostname) ||
      decodeURIComponent(target.pathname.slice(1)) !== NAME) {
    throw Error("Phase14I E2E refuses non-loopback or non-disposable database.");
  }
}

afterAll(async () => {
  if (enabled) await prisma.$disconnect();
});

suite("Phase14I three-job local-only PostgreSQL cycle", () => {
  it("runs strategy, opportunity and learning once, leaves Growth off and reuses the same-day results", async () => {
    // CI provisions a dedicated blank database. Never clean or connect to live data.
    expect(await prisma.growthJob.count()).toBe(0);
    await prisma.growthSettings.create({
      data: { id: "global", enabled: false, attributionEnabled: false },
    });

    // Outbound HTTP is forbidden in this isolated, credential-free qualification.
    const network = vi.fn(async () => { throw Error("OUTBOUND_NETWORK_FORBIDDEN"); });
    vi.stubGlobal("fetch", network);
    try {
      const result = await executeAutonomousGrowthCycle("2026-11-04");
      expect(result).toEqual({
        completed: 3, reused: 0, growth: "OFF", lease: "NONE",
        providerCalls: 0, aiCalls: 0, publications: 0,
      });

      const jobs = await prisma.growthJob.findMany({
        orderBy: { idempotencyKey: "asc" },
        select: { id: true, type: true, status: true, maxAttempts: true, idempotencyKey: true },
      });
      expect(jobs).toHaveLength(3);
      expect(new Set(jobs.map(job => job.type))).toEqual(new Set([
        GrowthJobType.ACCOUNT_STRATEGY_REVIEW,
        GrowthJobType.OPPORTUNITY_INTELLIGENCE_ANALYSIS,
        GrowthJobType.EVERGREEN_LEARNING_ANALYSIS,
      ]));
      expect(jobs.every(job => job.status === GrowthJobStatus.SUCCEEDED &&
        job.maxAttempts === 1 && job.idempotencyKey.startsWith("growth-cycle-v1:2026-11-04:")))
        .toBe(true);

      const settings = await prisma.growthSettings.findUniqueOrThrow({
        where: { id: "global" },
        select: { enabled: true, attributionEnabled: true, workerActivationExpiresAt: true },
      });
      expect(settings).toEqual({
        enabled: false, attributionEnabled: false, workerActivationExpiresAt: null,
      });
      expect(await prisma.growthAccountStrategyReview.count()).toBe(1);
      expect(await prisma.growthOpportunityAnalysisRun.count()).toBe(1);
      expect(await prisma.growthLearningRun.count()).toBe(1);
      expect(await prisma.growthPinPublication.count()).toBe(0);

      const repeated = await executeAutonomousGrowthCycle("2026-11-04");
      expect(repeated).toEqual({
        completed: 0, reused: 3, growth: "OFF", lease: "NONE",
        providerCalls: 0, aiCalls: 0, publications: 0,
      });
      expect(await prisma.growthJob.count()).toBe(3);
      expect(network).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
