// @vitest-environment node
import { describe, expect, it } from "vitest";
import { resolveGrowthRollout } from "@/lib/growth/rollout";
import { runGrowthWorker } from "@/lib/growth/worker";
describe("Exact scoped automatic recovery", () => {
  it("inventory reads require their scope and an exact ID, and cannot claim publications", async () => {
    const config = {
      GROWTH_WORKER_RUN_ENABLED: "true",
      GROWTH_ROLLOUT_MODE: "INVENTORY",
      GROWTH_INVENTORY_READ_SCOPE: "true",
    };
    expect(resolveGrowthRollout(config).allowedTypes).toEqual([
      "PINTEREST_ACCOUNT_SYNC",
      "PINTEREST_BOARD_SYNC",
    ]);
    expect(
      resolveGrowthRollout({ ...config, GROWTH_INVENTORY_READ_SCOPE: "false" })
        .mode,
    ).toBe("OFF");
    await expect(
      runGrowthWorker({ rolloutConfig: config }),
    ).resolves.toMatchObject({ status: "DISABLED", claimed: 0 });
  });
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
