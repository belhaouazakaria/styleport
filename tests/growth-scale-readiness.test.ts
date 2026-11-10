import { describe, expect, it } from "vitest";
import {
  assessGrowthScaleReadiness,
} from "@/lib/growth/portfolio/scale-readiness";

const current = {
  connectedAccounts: 1, pinsPerAccountPerDay: 10,
  designsPerAccountPerDay: 10, imageDailyHardCap: 3,
  globalDailyPinHardCap: 3,
  pinterestHourlyRequestCeiling: 4,
  pinterestDailyRequestCeiling: 16,
  budgetDailyCents: 200, budgetMonthlyCents: 3000,
  reservedImageCentsPerAttempt: 30,
  otherDailyReserveCents: 100,
  availableProviderWriteScope: true,
  fullyResumableAllAccountSync: false,
  perAccountExecutionEnabled: false,
  actualTimeSelectionIntegrated: false,
  dailyPrivateReportVerified: false,
};
describe("true multi-account launch readiness is evidence-dependent", () => {
  it("correctly BLOCKS today's existing live capacities", () => {
    const report = assessGrowthScaleReadiness(current);
    expect(report.targetDailyPinCount).toBe(10);
    expect(report.targetDailyDesignCount).toBe(10);
    expect(report.prerequisitesSatisfied).toBe(false);
    expect(report.blockers).toContain("GLOBAL_IMAGE_CAP_TOO_LOW");
    expect(report.blockers).toContain("GLOBAL_PUBLICATION_CAP_TOO_LOW");
    expect(report.blockers).toContain("AI_BUDGET_RESERVATION_ENVELOPE_TOO_LOW");
    expect(report.blockers).toContain("MULTI_ACCOUNT_SYNC_INCOMPLETE");
    expect(report.blockers).toContain("ACCOUNT_GENERATION_NOT_LIVE");
    expect(report.blockers).toContain("LEARNED_TIMES_NOT_INTEGRATED");
    expect(report.blockers).toContain("DAILY_PRIVATE_REPORT_NOT_VERIFIED");
    expect(report.everyPinMustBeOwnerSelected).toBe(true);
  });
  it("honors three-account thirty-Pin capacity, including API requests", () => {
    const data = { ...current, connectedAccounts: 3,
      imageDailyHardCap: 30, globalDailyPinHardCap: 30,
      budgetDailyCents: 1200, budgetMonthlyCents: 37200,
      fullyResumableAllAccountSync: true,
      perAccountExecutionEnabled: true,
      actualTimeSelectionIntegrated: true,
      dailyPrivateReportVerified: true,
    };
    const capped = assessGrowthScaleReadiness(data);
    expect(capped.targetDailyDesignCount).toBe(30);
    expect(capped.targetDailyPinCount).toBe(30);
    expect(capped.blockers).toContain("PROVIDER_DAILY_REQUEST_RESERVE_TOO_LOW");
    const ready = assessGrowthScaleReadiness({
      ...data, pinterestHourlyRequestCeiling: 12,
      pinterestDailyRequestCeiling: 100,
    });
    expect(ready.prerequisitesSatisfied).toBe(true);
    expect(ready.blockers).toEqual([]);
    expect(ready.everyPinMustBeOwnerSelected).toBe(true);
  });
  it("does not treat arbitrary user flexibility as unlimited spend", () => {
    expect(() => assessGrowthScaleReadiness({
      ...current, connectedAccounts: -1,
    })).toThrow("GROWTH_READINESS_INPUT_INVALID");
    expect(assessGrowthScaleReadiness({
      ...current, connectedAccounts: 3, budgetMonthlyCents: 0,
    }).blockers).toContain("AI_BUDGET_RESERVATION_ENVELOPE_TOO_LOW");
  });
});
