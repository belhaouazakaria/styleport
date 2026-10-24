export const GROWTH_BUDGET_WARNING_PERCENTS = [70, 90] as const;
export const GROWTH_DEFAULT_BUDGET_CENTS = { daily: 200, monthly: 3000 } as const;
export const GROWTH_DEFAULT_CONTENT_CAPS = {
  aiImagesPerDay: 3,
  translatorCreatesPerDay: 1,
  translatorUpdatesPerDay: 3,
  ideaCreatesPerWeek: 2,
} as const;

export interface GrowthAiBudgetSnapshot {
  dailyBudgetCents: number;
  monthlyBudgetCents: number;
  dailyCommittedCents: number;
  monthlyCommittedCents: number;
}

export type GrowthBudgetAdmission =
  | { allowed: true; dailyAfterCents: number; monthlyAfterCents: number; warningPercents: number[] }
  | { allowed: false; reason: "UNKNOWN_PRICE" | "INVALID_BUDGET" | "DAILY_LIMIT" | "MONTHLY_LIMIT" };

function isCents(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

// Pure policy only. A later database-backed admission service MUST serialize
// competing reservations and persist them before using this result for a paid call.
export function assessGrowthBudgetAdmission(
  snapshot: GrowthAiBudgetSnapshot,
  requestPriceCeilingCents: number | null,
): GrowthBudgetAdmission {
  if (requestPriceCeilingCents === null || !Number.isSafeInteger(requestPriceCeilingCents) || requestPriceCeilingCents <= 0) {
    return { allowed: false, reason: "UNKNOWN_PRICE" };
  }
  if (![snapshot.dailyBudgetCents, snapshot.monthlyBudgetCents, snapshot.dailyCommittedCents, snapshot.monthlyCommittedCents].every(isCents) ||
    snapshot.dailyBudgetCents < 1 || snapshot.monthlyBudgetCents < 1) {
    return { allowed: false, reason: "INVALID_BUDGET" };
  }
  const dailyAfterCents = snapshot.dailyCommittedCents + requestPriceCeilingCents;
  const monthlyAfterCents = snapshot.monthlyCommittedCents + requestPriceCeilingCents;
  if (!Number.isSafeInteger(dailyAfterCents) || !Number.isSafeInteger(monthlyAfterCents)) {
    return { allowed: false, reason: "INVALID_BUDGET" };
  }
  if (dailyAfterCents > snapshot.dailyBudgetCents) return { allowed: false, reason: "DAILY_LIMIT" };
  if (monthlyAfterCents > snapshot.monthlyBudgetCents) return { allowed: false, reason: "MONTHLY_LIMIT" };
  const dailyPct = dailyAfterCents * 100 / snapshot.dailyBudgetCents;
  const monthlyPct = monthlyAfterCents * 100 / snapshot.monthlyBudgetCents;
  return {
    allowed: true,
    dailyAfterCents,
    monthlyAfterCents,
    warningPercents: GROWTH_BUDGET_WARNING_PERCENTS.filter((pct) => dailyPct >= pct || monthlyPct >= pct),
  };
}

export function growthBudgetUtcWindows(now: Date) {
  const date = now.getTime();
  if (!Number.isFinite(date)) throw new Error("Invalid accounting date.");
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return { dayStart, monthStart };
}
