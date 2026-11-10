/**
 * Pure evidence-driven readiness check. Never infers live provider permission
 * or changes settings. A planning target is not publication authorization.
 */
export type GrowthScaleCapacity = {
  connectedAccounts: number;
  pinsPerAccountPerDay: number;
  designsPerAccountPerDay: number;
  imageDailyHardCap: number;
  globalDailyPinHardCap: number;
  pinterestHourlyRequestCeiling: number;
  pinterestDailyRequestCeiling: number;
  budgetDailyCents: number;
  budgetMonthlyCents: number;
  reservedImageCentsPerAttempt: number;
  otherDailyReserveCents: number;
  availableProviderWriteScope: boolean;
  fullyResumableAllAccountSync: boolean;
  perAccountExecutionEnabled: boolean;
  actualTimeSelectionIntegrated: boolean;
  dailyPrivateReportVerified: boolean;
};
export type GrowthScaleReadiness = {
  targetDailyPinCount: number;
  targetDailyDesignCount: number;
  prerequisitesSatisfied: boolean;
  blockers: string[];
  everyPinMustBeOwnerSelected: true;
  unknownProviderCostTreatedAsZero: false;
};

export function assessGrowthScaleReadiness(input: GrowthScaleCapacity): GrowthScaleReadiness {
  const quantities = [
    input.connectedAccounts, input.pinsPerAccountPerDay,
    input.designsPerAccountPerDay, input.imageDailyHardCap,
    input.globalDailyPinHardCap, input.pinterestHourlyRequestCeiling,
    input.pinterestDailyRequestCeiling, input.budgetDailyCents,
    input.budgetMonthlyCents, input.reservedImageCentsPerAttempt,
    input.otherDailyReserveCents,
  ];
  if (quantities.some(n => !Number.isSafeInteger(n) || n < 0) ||
      input.connectedAccounts > 1000 || input.pinsPerAccountPerDay > 10 ||
      input.designsPerAccountPerDay > 10 ||
      input.reservedImageCentsPerAttempt < 1) {
    throw Error("GROWTH_READINESS_INPUT_INVALID");
  }
  const targetDailyPinCount = input.connectedAccounts * input.pinsPerAccountPerDay;
  const targetDailyDesignCount = input.connectedAccounts * input.designsPerAccountPerDay;
  const dailyMinimumCents = targetDailyDesignCount *
    input.reservedImageCentsPerAttempt + input.otherDailyReserveCents;
  const blockers: string[] = [];
  if (input.connectedAccounts === 0) blockers.push("NO_CONNECTED_ACCOUNT");
  if (input.imageDailyHardCap < targetDailyDesignCount)
    blockers.push("GLOBAL_IMAGE_CAP_TOO_LOW");
  if (input.globalDailyPinHardCap < targetDailyPinCount)
    blockers.push("GLOBAL_PUBLICATION_CAP_TOO_LOW");
  // Each Pin consumes at least one POST and retries, analytics, board/account
  // reads and token refresh require independent capacity.
  if (input.pinterestDailyRequestCeiling <= targetDailyPinCount)
    blockers.push("PROVIDER_DAILY_REQUEST_RESERVE_TOO_LOW");
  if (input.pinterestHourlyRequestCeiling < 2)
    blockers.push("PROVIDER_HOURLY_REQUEST_RESERVE_TOO_LOW");
  if (input.budgetDailyCents < dailyMinimumCents ||
      input.budgetMonthlyCents < dailyMinimumCents * 31)
    blockers.push("AI_BUDGET_RESERVATION_ENVELOPE_TOO_LOW");
  if (!input.availableProviderWriteScope) blockers.push("PINTEREST_WRITE_SCOPE_MISSING");
  if (!input.fullyResumableAllAccountSync) blockers.push("MULTI_ACCOUNT_SYNC_INCOMPLETE");
  if (!input.perAccountExecutionEnabled) blockers.push("ACCOUNT_GENERATION_NOT_LIVE");
  if (!input.actualTimeSelectionIntegrated) blockers.push("LEARNED_TIMES_NOT_INTEGRATED");
  if (!input.dailyPrivateReportVerified) blockers.push("DAILY_PRIVATE_REPORT_NOT_VERIFIED");
  return {
    targetDailyPinCount, targetDailyDesignCount,
    prerequisitesSatisfied: blockers.length === 0,
    blockers,
    everyPinMustBeOwnerSelected: true,
    unknownProviderCostTreatedAsZero: false,
  };
}
