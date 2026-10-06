import { GrowthPinterestPublicationRole } from "@prisma/client";

export const ACCOUNT_STRATEGY_MODEL_VERSION = "account_strategy_v1";
export const ACCOUNT_STRATEGY_WINDOW_DAYS = 28;
export const ACCOUNT_STRATEGY_PLANNED_ACCOUNT_COUNT = 3;
export const ACCOUNT_STRATEGY_MAX_BOARDS = 100;
export const ACCOUNT_STRATEGY_MAX_PINS = 2_500;
export const ACCOUNT_STRATEGY_ANALYTICS_FRESH_MS = 36 * 60 * 60 * 1_000;
export const ACCOUNT_STRATEGY_SYNC_FRESH_MS = 7 * 24 * 60 * 60 * 1_000;
export const ACCOUNT_STRATEGY_MIN_RELEVANT_PINS = 5;
export const ACCOUNT_STRATEGY_MIN_OBSERVATION_DAYS = 14;
export const ACCOUNT_STRATEGY_HIGH_CONCENTRATION_PERCENT = 70;

export const ACCOUNT_STRATEGY_ROLES = [
  {
    role: GrowthPinterestPublicationRole.SAYTWIST,
    label: "SayTwist",
    intent: "UTILITY",
    purpose: "Main brand and direct translator discovery",
  },
  {
    role: GrowthPinterestPublicationRole.SAYTWIST_IDEAS,
    label: "SayTwist Ideas",
    intent: "INSPIRATION",
    purpose: "Save-worthy editorial inspiration",
  },
  {
    role: GrowthPinterestPublicationRole.SAYTWIST_PLAYGROUND,
    label: "SayTwist Playground",
    intent: "PLAYGROUND",
    purpose: "Entertainment, identity, and shareability",
  },
] as const;

export function accountStrategyReviewWindow(now = new Date()) {
  const reviewMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  );
  const evidenceWindowEnd = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1),
  );
  const evidenceWindowStart = new Date(evidenceWindowEnd);
  evidenceWindowStart.setUTCDate(
    evidenceWindowStart.getUTCDate() - (ACCOUNT_STRATEGY_WINDOW_DAYS - 1),
  );
  return { reviewMonth, evidenceWindowStart, evidenceWindowEnd };
}

export function accountStrategyPeriodKey(reviewMonth: Date) {
  return reviewMonth.toISOString().slice(0, 7);
}
