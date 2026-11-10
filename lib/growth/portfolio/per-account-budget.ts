/**
 * Config proposal only; the spend-admission ledger continues to enforce
 * explicit persisted GrowthSettings hard limits. No budget writes here.
 */
export type MultiAccountBudgetProjection = {
  accounts: number;
  dailyDesignTarget: number;
  dailyReservedImageCents: number;
  recommendedDailyHardLimitCents: number;
  recommendedMonthlyHardLimitCents: number;
  currentDailyHardLimitCents: number;
  currentMonthlyHardLimitCents: number;
  currentGlobalImageCap: number;
  needsOwnerBudgetChange: boolean;
  needsOwnerImageCapChange: boolean;
};

/**
 * Provide enough reservation capacity for the requested 10 images/account
 * plus a configurable text/recovery envelope. Uses the conservative
 * per-request upper reservation value, not an assertion of actual billed cost.
 * Monthly 31-day envelope never silently underestimates a long month.
 */
export function projectMultiAccountBudget(input: {
  connectedAccounts: number;
  designsPerAccount: number;
  imageReservationCents: number;
  extraDailyReserveCentsPerAccount: number;
  currentDailyHardLimitCents: number;
  currentMonthlyHardLimitCents: number;
  currentGlobalImageCap: number;
}): MultiAccountBudgetProjection {
  const values = Object.values(input);
  if (values.some(v => !Number.isSafeInteger(v) || v < 0) ||
      input.connectedAccounts > 1000 ||
      input.designsPerAccount > 10 ||
      input.imageReservationCents < 1 ||
      input.imageReservationCents > 10_000 ||
      input.currentGlobalImageCap > 1_000_000) {
    throw Error("ACCOUNT_BUDGET_INPUT_INVALID");
  }
  const dailyDesignTarget = input.connectedAccounts * input.designsPerAccount;
  const dailyReservedImageCents = dailyDesignTarget * input.imageReservationCents;
  const dailyEnvelope = dailyReservedImageCents +
    input.connectedAccounts * input.extraDailyReserveCentsPerAccount;
  const monthlyEnvelope = dailyEnvelope * 31;
  if (![dailyDesignTarget, dailyReservedImageCents, dailyEnvelope, monthlyEnvelope]
    .every(Number.isSafeInteger)) throw Error("ACCOUNT_BUDGET_OVERFLOW");
  const recommendedDailyHardLimitCents = Math.max(1, dailyEnvelope);
  const recommendedMonthlyHardLimitCents = Math.max(1, monthlyEnvelope);
  return {
    accounts: input.connectedAccounts, dailyDesignTarget,
    dailyReservedImageCents, recommendedDailyHardLimitCents,
    recommendedMonthlyHardLimitCents,
    currentDailyHardLimitCents: input.currentDailyHardLimitCents,
    currentMonthlyHardLimitCents: input.currentMonthlyHardLimitCents,
    currentGlobalImageCap: input.currentGlobalImageCap,
    needsOwnerBudgetChange:
      input.currentDailyHardLimitCents < recommendedDailyHardLimitCents ||
      input.currentMonthlyHardLimitCents < recommendedMonthlyHardLimitCents,
    needsOwnerImageCapChange: input.currentGlobalImageCap < dailyDesignTarget,
  };
}
