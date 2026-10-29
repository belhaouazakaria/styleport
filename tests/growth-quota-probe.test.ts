import { describe, expect, it } from "vitest";

import { assessPinterestQuota, assertReadOnlyProbeGates, QuotaProbeBlocked, safeQuotaLimitStructure } from "@/lib/growth/operations/quota-probe";

const headers = (limit: string | null, remaining: string | null, reset: string | null) => ({
  get: (key: string) => key === "x-ratelimit-limit" ? limit
    : key === "x-ratelimit-remaining" ? remaining
    : key === "x-ratelimit-reset" ? reset : null,
});

describe("Phase 14B provider quota probe safeguards", () => {
  it("requires complete numeric headers and preserves five requests", () => {
    expect(assessPinterestQuota(headers("60","43","21"))).toEqual({limit:60,remaining:43,resetSeconds:21});
    expect(assessPinterestQuota(headers("100, 100;w=1, 1000;w=60","99","1")))
      .toEqual({limit:100,remaining:99,resetSeconds:1});
    expect(() => assessPinterestQuota(headers("100, invalid;w=60","99","1"))).toThrow("QUOTA_UNAVAILABLE");
    expect(() => assessPinterestQuota(headers("100, 100;w=1, 1000;w=60","5","1"))).toThrow("QUOTA_LOW");
    expect(() => assessPinterestQuota(headers("60",null,"21"))).toThrow(QuotaProbeBlocked);
    try { assessPinterestQuota(headers("60", null, "21")); } catch (error) {
      expect(error).toBeInstanceOf(QuotaProbeBlocked);
      expect((error as QuotaProbeBlocked).evidence).toEqual({
        limit: "INTEGER", remaining: "ABSENT", reset: "INTEGER", limitStructure: "N",
      });
    }
    try { assessPinterestQuota(headers("100, 100;w=1, 1000;w=60", "99.9", "1")); } catch (error) {
      expect((error as QuotaProbeBlocked).evidence).toEqual({
        limit: "WINDOWS", remaining: "OTHER", reset: "INTEGER", limitStructure: "N, N;A=N, N;A=N",
      });
    }
    expect(() => assessPinterestQuota(headers("60","5","21"))).toThrow("QUOTA_LOW");
    expect(() => assessPinterestQuota(headers("60","61","21"))).toThrow("QUOTA_UNAVAILABLE");
    expect(() => assessPinterestQuota(headers("60","43","1690000000"))).toThrow("QUOTA_UNAVAILABLE");
    expect(() => assessPinterestQuota(headers("60","42.5","12"))).toThrow("QUOTA_UNAVAILABLE");
  });
  it("produces only a bounded, value-free limit structure for diagnostic output", () => {
    expect(safeQuotaLimitStructure("100, 100;w=1, 1000;w=60")).toBe("N, N;A=N, N;A=N");
    expect(safeQuotaLimitStructure("100;w=1, 1000;w=60, org_read")).toBe("N;A=N, N;A=N, A_A");
    expect(safeQuotaLimitStructure("some-secret-token-123456")).toBe("A-A-A-N");
    expect(safeQuotaLimitStructure("token/secret")).toBe("REDACTED");
    expect(safeQuotaLimitStructure("X".repeat(121))).toBe("REDACTED");
    expect(safeQuotaLimitStructure(null)).toBe("ABSENT");
  });

  it("fails closed if worker, attribution or report flags are enabled", () => {
    const flags = ["GROWTH_WORKER_RUN_ENABLED","GROWTH_DAILY_REPORT_SCHEDULE_ENABLED",
      "TELEGRAM_REPORTS_ENABLED","GROWTH_ATTRIBUTION_COLLECTION_ENABLED"];
    for (const key of flags) expect(() => assertReadOnlyProbeGates({[key]:"true"})).toThrow("GROWTH_NOT_OFF");
    expect(() => assertReadOnlyProbeGates({GROWTH_ROLLOUT_MODE:"OBSERVE"})).toThrow("GROWTH_NOT_OFF");
    expect(() => assertReadOnlyProbeGates({GROWTH_ROLLOUT_MODE:"RECOMMEND"})).toThrow("GROWTH_NOT_OFF");
    expect(() => assertReadOnlyProbeGates({GROWTH_ROLLOUT_MODE:"OFF",TELEGRAM_REPORTS_ENABLED:"false"})).not.toThrow();
  });
});
