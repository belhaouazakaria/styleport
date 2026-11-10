import { describe, expect, it } from "vitest";
import { projectMultiAccountBudget } from "@/lib/growth/portfolio/per-account-budget";

const base = {
  connectedAccounts: 1, designsPerAccount: 10,
  imageReservationCents: 30,
  extraDailyReserveCentsPerAccount: 100,
  currentDailyHardLimitCents: 200,
  currentMonthlyHardLimitCents: 3000,
  currentGlobalImageCap: 3,
};

describe("multi-account AI budget capacity planning", () => {
  it("projects one, three and many connected accounts independently", () => {
    const one = projectMultiAccountBudget(base);
    expect(one).toMatchObject({
      accounts: 1, dailyDesignTarget: 10,
      dailyReservedImageCents: 300,
      recommendedDailyHardLimitCents: 400,
      recommendedMonthlyHardLimitCents: 12400,
      needsOwnerBudgetChange: true,
      needsOwnerImageCapChange: true,
    });
    const three = projectMultiAccountBudget({ ...base, connectedAccounts: 3 });
    expect(three).toMatchObject({
      dailyDesignTarget: 30, dailyReservedImageCents: 900,
      recommendedDailyHardLimitCents: 1200,
      recommendedMonthlyHardLimitCents: 37200,
    });
  });
  it("never silently authorizes spending changes", () => {
    const enough = projectMultiAccountBudget({
      ...base, currentDailyHardLimitCents: 2000,
      currentMonthlyHardLimitCents: 62000, currentGlobalImageCap: 20,
    });
    expect(enough.needsOwnerBudgetChange).toBe(false);
    expect(enough.needsOwnerImageCapChange).toBe(false);
    expect(enough.currentDailyHardLimitCents).toBe(2000);
  });
  it("rejects invalid or overflowing quantities", () => {
    expect(() => projectMultiAccountBudget({
      ...base, connectedAccounts: -1,
    })).toThrow("ACCOUNT_BUDGET_INPUT_INVALID");
    expect(() => projectMultiAccountBudget({
      ...base, designsPerAccount: 11,
    })).toThrow("ACCOUNT_BUDGET_INPUT_INVALID");
    expect(() => projectMultiAccountBudget({
      ...base, imageReservationCents: Number.MAX_SAFE_INTEGER,
    })).toThrow("ACCOUNT_BUDGET_INPUT_INVALID");
  });
});
