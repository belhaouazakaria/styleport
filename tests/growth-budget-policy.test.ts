import { describe, expect, it } from "vitest";
import { assessGrowthBudgetAdmission, growthBudgetUtcWindows } from "@/lib/growth/economics/budget-policy";

const snapshot = { dailyBudgetCents: 200, monthlyBudgetCents: 3000, dailyCommittedCents: 0, monthlyCommittedCents: 0 };

describe("Growth budget admission policy", () => {
  it("fails closed on unknown or malformed price ceilings", () => {
    for (const value of [null, 0, -1, NaN, 2.5]) {
      expect(assessGrowthBudgetAdmission(snapshot, value)).toEqual({ allowed: false, reason: "UNKNOWN_PRICE" });
    }
  });
  it("reserves only within BOTH daily and monthly budgets", () => {
    expect(assessGrowthBudgetAdmission({ ...snapshot, dailyCommittedCents: 190 }, 11)).toEqual({ allowed: false, reason: "DAILY_LIMIT" });
    expect(assessGrowthBudgetAdmission({ ...snapshot, monthlyCommittedCents: 2998 }, 3)).toEqual({ allowed: false, reason: "MONTHLY_LIMIT" });
    expect(assessGrowthBudgetAdmission({ ...snapshot, dailyCommittedCents: 190 }, 10)).toMatchObject({ allowed: true, dailyAfterCents: 200 });
  });
  it("includes 70 and 90 percent thresholds", () => {
    expect(assessGrowthBudgetAdmission({ ...snapshot, dailyCommittedCents: 129 }, 11)).toMatchObject({ warningPercents: [70] });
    expect(assessGrowthBudgetAdmission({ ...snapshot, dailyCommittedCents: 179 }, 11)).toMatchObject({ warningPercents: [70, 90] });
  });
  it("uses UTC accounting boundaries", () => {
    const range = growthBudgetUtcWindows(new Date("2026-10-18T23:59:59Z"));
    expect(range.dayStart.toISOString()).toBe("2026-10-18T00:00:00.000Z");
    expect(range.monthStart.toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });
});
