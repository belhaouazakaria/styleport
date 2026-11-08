import { GrowthJobType } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { resolveGrowthRollout } from "@/lib/growth/rollout";
import { runGrowthWorker } from "@/lib/growth/worker";

describe("exact-job-only autonomous content PREPARE isolation", () => {
  const flags = {
    GROWTH_WORKER_RUN_ENABLED: "true",
    GROWTH_ROLLOUT_MODE: "PREPARE",
    GROWTH_AUTONOMOUS_CONTENT_SCOPE: "true",
  };

  it("fails closed without isolated content scope", () => {
    expect(resolveGrowthRollout({
      GROWTH_WORKER_RUN_ENABLED: "true",
      GROWTH_ROLLOUT_MODE: "PREPARE",
    })).toEqual({ mode: "OFF", allowedTypes: [] });
  });

  it("only permits content decisions/execution, never Pinterest publication", () => {
    const result = resolveGrowthRollout(flags);
    expect(result.mode).toBe("PREPARE");
    expect(result.allowedTypes).toContain(GrowthJobType.TRANSLATOR_AUTOPILOT_DECIDE);
    expect(result.allowedTypes).toContain(GrowthJobType.IDEA_AUTOPILOT_EXECUTE);
    expect(result.allowedTypes).not.toContain(GrowthJobType.PINTEREST_PIN_PUBLISH);
    expect(result.allowedTypes).not.toContain(GrowthJobType.CREATIVE_LAB_GENERATE);
    expect(result.allowedTypes).not.toContain(GrowthJobType.PINTEREST_PIN_RECONCILE);
  });

  it("never scans the generic job queue without an exact job ID", async () => {
    await expect(runGrowthWorker({ rolloutConfig: flags })).resolves.toEqual({
      status: "DISABLED", claimed: 0, succeeded: 0, failed: 0,
    });
  });
});
