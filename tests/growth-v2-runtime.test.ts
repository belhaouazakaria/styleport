// @vitest-environment node
import { describe, expect, it } from "vitest";
import { resolveGrowthRollout } from "@/lib/growth/rollout";
import { runGrowthWorker } from "@/lib/growth/worker";
describe("Exact scoped automatic recovery", () => {
  it("is off without both explicit process and scoped recovery gates", () => {
    expect(resolveGrowthRollout({ GROWTH_ROLLOUT_MODE: "RECOVER" }).mode).toBe(
      "OFF",
    );
    expect(
      resolveGrowthRollout({
        GROWTH_WORKER_RUN_ENABLED: "true",
        GROWTH_ROLLOUT_MODE: "RECOVER",
      }).mode,
    ).toBe("OFF");
    expect(
      resolveGrowthRollout({
        GROWTH_WORKER_RUN_ENABLED: "true",
        GROWTH_ROLLOUT_MODE: "RECOVER",
        GROWTH_AUTOMATIC_BACKFILL_SCOPE: "true",
      }).allowedTypes,
    ).toEqual(["PINTEREST_ANALYTICS_GAP_RECOVERY"]);
  });
  it("refuses an unscoped worker before querying PostgreSQL", async () => {
    await expect(
      runGrowthWorker({
        rolloutConfig: {
          GROWTH_WORKER_RUN_ENABLED: "true",
          GROWTH_ROLLOUT_MODE: "RECOVER",
          GROWTH_AUTOMATIC_BACKFILL_SCOPE: "true",
        },
      }),
    ).resolves.toMatchObject({ status: "DISABLED", claimed: 0 });
  });
});
