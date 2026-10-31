import { describe, expect, it } from "vitest";

import {
  assessPinterestQuota, assertReadOnlyProbeGates, QuotaProbeBlocked, safeQuotaLimitStructure,
} from "@/lib/growth/operations/quota-probe";
import { PinterestOneGetBudget } from "@/lib/growth/pinterest/one-get-budget";

const headers = (limit: string | null, remaining: string | null, reset: string | null) => ({
  get: (key: string) => key === "x-ratelimit-limit" ? limit
    : key === "x-ratelimit-remaining" ? remaining
    : key === "x-ratelimit-reset" ? reset : null,
});
const known = (limit: number, remaining: number, resetSeconds: number) => ({
  limit, remaining, resetSeconds, limitGrammar: "DOCUMENTED", recurringAuthorized: false,
});
const unrecognized = (remaining: number, resetSeconds: number) => ({
  limit: null, remaining, resetSeconds, limitGrammar: "UNRECOGNIZED",
  recurringAuthorized: false,
});

describe("Phase14D strict one-GET quota evidence", () => {
  it("accepts documented integer and composite syntax but never authorizes recurrence", () => {
    expect(assessPinterestQuota(headers("60", "43", "21"))).toEqual(known(60, 43, 21));
    expect(assessPinterestQuota(headers("100, 100;w=1, 1000;w=60", "99", "1")))
      .toEqual(known(100, 99, 1));
    expect(assessPinterestQuota(headers(
      '100, 100;w=1;name="global_default_limit", 1000;w=60;name="org_read_rate_limit"',
      "99", "1",
    ))).toEqual(known(100, 99, 1));
  });

  it("allows one bounded diagnostic on an opaque limit only if numeric remaining and reset are valid", () => {
    const examples = ["some_other_limit_format", "100, invalid;w=60", "200;w=1:mode=unknown",
      '100, 100;w=1;name="bad-value"', "opaque_limit_format"];
    for (const limit of examples) {
      expect(assessPinterestQuota(headers(limit, "48", "60"))).toEqual(unrecognized(48, 60));
    }
    expect(assessPinterestQuota(headers("X".repeat(122), "48", "60")))
      .toEqual(unrecognized(48, 60));
  });

  it("fails closed on absent/invalid counters, reset window, provider reserve, or contradictory known cap", () => {
    for (const caseHeaders of [
      headers(null, "43", "21"),
      headers("", "43", "21"),
      headers("60", null, "21"),
      headers("60", "43", null),
      headers("opaque", "NaN", "21"),
      headers("opaque", "99.9", "21"),
      headers("opaque", "-1", "21"),
      headers("opaque", "01", "21"),
      headers("opaque", "43", "1.2"),
      headers("opaque", "43", "9999999"),
      headers("opaque", "43", "-1"),
      headers("opaque", "43", "01"),
      headers("60", "61", "21"),
      headers("opaque", "43", "21;token=secret"),
      headers("X".repeat(513), "43", "21"),
    ]) {
      expect(() => assessPinterestQuota(caseHeaders)).toThrow(QuotaProbeBlocked);
    }
    for (const n of ["0", "1", "5"]) {
      expect(() => assessPinterestQuota(headers("opaque", n, "60"))).toThrow("QUOTA_LOW");
    }
    expect(() => assessPinterestQuota(headers("opaque", "6", "86400")))
      .not.toThrow();
  });

  it("preserves value-free diagnostic header shapes without leaking raw values", () => {
    expect(safeQuotaLimitStructure("100, 100;w=1, 1000;w=60"))
      .toBe("N, N;A=N, N;A=N");
    expect(safeQuotaLimitStructure("100;w=1, 1000;w=60, org_read"))
      .toBe("N;A=N, N;A=N, A_A");
    expect(safeQuotaLimitStructure("token/secret")).toBe("REDACTED");
    expect(safeQuotaLimitStructure("X".repeat(121))).toBe("REDACTED");
    expect(safeQuotaLimitStructure(null)).toBe("ABSENT");
    try { assessPinterestQuota(headers("opaque", null, "21")); }
    catch (error) {
      expect(error).toBeInstanceOf(QuotaProbeBlocked);
      expect((error as QuotaProbeBlocked).evidence).toEqual({
        limit: "OTHER", remaining: "ABSENT", reset: "INTEGER", limitStructure: "A",
      });
    }
  });
});

describe("Local one-GET request allowance", () => {
  it("permits exactly one request, before/after the response", () => {
    const b = new PinterestOneGetBudget();
    b.claim();
    expect(b.requestsReserved).toBe(1);
    expect(() => b.claim()).toThrow("PINTEREST_LOCAL_BUDGET_EXHAUSTED");
    b.observe(200);
    expect(() => b.claim()).toThrow("PINTEREST_LOCAL_BUDGET_EXHAUSTED");
    expect(() => b.observe(200)).toThrow("PINTEREST_LOCAL_BUDGET_STATE_INVALID");
  });
  it("consumes allowance on timeout, 429 and all other provider errors; never retries", () => {
    const timeout = new PinterestOneGetBudget();
    timeout.claim();
    expect(() => timeout.claim()).toThrow("PINTEREST_LOCAL_BUDGET_EXHAUSTED");
    const limited = new PinterestOneGetBudget();
    limited.claim();
    expect(() => limited.observe(429)).toThrow("PINTEREST_RATE_LIMITED");
    expect(() => limited.claim()).toThrow("PINTEREST_LOCAL_BUDGET_EXHAUSTED");
    const denied = new PinterestOneGetBudget();
    denied.claim();
    expect(() => denied.observe(503)).toThrow("PINTEREST_REQUEST_REJECTED");
    expect(() => denied.claim()).toThrow("PINTEREST_LOCAL_BUDGET_EXHAUSTED");
    expect(() => new PinterestOneGetBudget().observe(200))
      .toThrow("PINTEREST_LOCAL_BUDGET_STATE_INVALID");
  });
});

describe("Phase14D owner-gated provider probe", () => {
  it("refuses active worker, attribution, recurring report or rollout mode", () => {
    for (const key of [
      "GROWTH_WORKER_RUN_ENABLED", "GROWTH_DAILY_REPORT_SCHEDULE_ENABLED",
      "TELEGRAM_REPORTS_ENABLED", "GROWTH_ATTRIBUTION_COLLECTION_ENABLED",
    ]) expect(() => assertReadOnlyProbeGates({ [key]: "true" }))
      .toThrow("GROWTH_NOT_OFF");
    for (const mode of ["OBSERVE", "RECOMMEND"]) {
      expect(() => assertReadOnlyProbeGates({ GROWTH_ROLLOUT_MODE: mode }))
        .toThrow("GROWTH_NOT_OFF");
    }
    expect(() => assertReadOnlyProbeGates({
      GROWTH_ROLLOUT_MODE: "OFF", TELEGRAM_REPORTS_ENABLED: "false",
    })).not.toThrow();
  });
});
