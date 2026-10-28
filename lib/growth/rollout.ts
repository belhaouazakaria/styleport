import { GrowthJobType } from "@prisma/client";

/** The Phase 14 observer and recommendation worker is opt-in and process-gated.
 * No current mode permits generative AI, content mutation or Pinterest publishing.
 */
export type GrowthRolloutMode = "OFF" | "OBSERVE" | "RECOMMEND";

const OBSERVE: GrowthJobType[] = [
  GrowthJobType.FOUNDATION_NOOP,
  GrowthJobType.PINTEREST_ACCOUNT_SYNC,
  GrowthJobType.PINTEREST_BOARD_SYNC,
  GrowthJobType.PINTEREST_PIN_INVENTORY_SYNC,
  GrowthJobType.PINTEREST_ACCOUNT_ANALYTICS_SYNC,
  GrowthJobType.PINTEREST_PIN_ANALYTICS_SYNC,
];
const RECOMMEND: GrowthJobType[] = [
  GrowthJobType.ACCOUNT_STRATEGY_REVIEW,
  GrowthJobType.OPPORTUNITY_INTELLIGENCE_ANALYSIS,
  GrowthJobType.EVERGREEN_LEARNING_ANALYSIS,
];

export function resolveGrowthRollout(
  env: Record<string, string | undefined> = process.env,
): { mode: GrowthRolloutMode; allowedTypes: GrowthJobType[] } {
  if (env.GROWTH_WORKER_RUN_ENABLED !== "true") return { mode: "OFF", allowedTypes: [] };
  if (env.GROWTH_ROLLOUT_MODE === "OBSERVE") return { mode: "OBSERVE", allowedTypes: [...OBSERVE] };
  if (env.GROWTH_ROLLOUT_MODE === "RECOMMEND") {
    return { mode: "RECOMMEND", allowedTypes: [...OBSERVE, ...RECOMMEND] };
  }
  return { mode: "OFF", allowedTypes: [] };
}
