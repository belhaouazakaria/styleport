import { describe, expect, it } from "vitest";
import { GrowthJobType } from "@prisma/client";
import { resolveGrowthRollout } from "@/lib/growth/rollout";

describe("Phase 14 rollout allowlists", () => {
  const env = { GROWTH_WORKER_RUN_ENABLED: "true" };
  it("fails closed on disabled or unsupported modes", () => {
    expect(resolveGrowthRollout({}).mode).toBe("OFF");
    expect(resolveGrowthRollout({ GROWTH_ROLLOUT_MODE: "OBSERVE" }).mode).toBe("OFF");
    expect(resolveGrowthRollout({ ...env, GROWTH_ROLLOUT_MODE: "FULL" }).mode).toBe("OFF");
  });
  it("observation cannot perform paid or publishing actions", () => {
    const v = resolveGrowthRollout({ ...env, GROWTH_ROLLOUT_MODE: "OBSERVE" }).allowedTypes;
    expect(v).toContain(GrowthJobType.PINTEREST_ACCOUNT_ANALYTICS_SYNC);
    expect(v).not.toContain(GrowthJobType.PINTEREST_PIN_PUBLISH);
    expect(v).not.toContain(GrowthJobType.PINTEREST_ANALYTICS_GAP_RECOVERY);
    expect(v).not.toContain(GrowthJobType.CREATIVE_LAB_GENERATE);
    expect(v).not.toContain(GrowthJobType.TRANSLATOR_AUTOPILOT_EXECUTE);
    expect(v).not.toContain(GrowthJobType.IDEA_AUTOPILOT_EXECUTE);
  });
  it("recommendation is deterministic and retains the publishing ban", () => {
    const v = resolveGrowthRollout({ ...env, GROWTH_ROLLOUT_MODE: "RECOMMEND" }).allowedTypes;
    expect(v).toContain(GrowthJobType.OPPORTUNITY_INTELLIGENCE_ANALYSIS);
    expect(v).toContain(GrowthJobType.EVERGREEN_LEARNING_ANALYSIS);
    expect(v).not.toContain(GrowthJobType.PINTEREST_PIN_PUBLISH);
    expect(v).not.toContain(GrowthJobType.TRANSLATOR_AUTOPILOT_DECIDE);
    expect(v).not.toContain(GrowthJobType.IDEA_AUTOPILOT_DECIDE);
  });
});
