import { describe, expect, it } from "vitest";
import { GrowthJobType } from "@prisma/client";
import { resolveGrowthRollout } from "@/lib/growth/rollout";

describe("approved-only Pinterest publishing process mode", () => {
  it("allows only the one persisted approved publish job type after two explicit gates", () => {
    const allowed = resolveGrowthRollout({
      GROWTH_WORKER_RUN_ENABLED: "true",
      GROWTH_ROLLOUT_MODE: "APPROVED_PUBLISH",
      GROWTH_APPROVED_PUBLISH_SCOPE: "true",
    });
    expect(allowed.mode).toBe("APPROVED_PUBLISH");
    expect(allowed.allowedTypes).toEqual([GrowthJobType.PINTEREST_PIN_PUBLISH]);
  });
  it("remains disabled with any missing or unrelated approval gate", () => {
    for (const env of [
      { GROWTH_WORKER_RUN_ENABLED: "false", GROWTH_ROLLOUT_MODE: "APPROVED_PUBLISH", GROWTH_APPROVED_PUBLISH_SCOPE: "true" },
      { GROWTH_WORKER_RUN_ENABLED: "true", GROWTH_ROLLOUT_MODE: "APPROVED_PUBLISH" },
      { GROWTH_WORKER_RUN_ENABLED: "true", GROWTH_ROLLOUT_MODE: "AUTOPILOT", GROWTH_APPROVED_PUBLISH_SCOPE: "true" },
    ]) {
      expect(resolveGrowthRollout(env)).toEqual({ mode: "OFF", allowedTypes: [] });
    }
  });
});
