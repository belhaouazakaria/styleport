import { describe, expect, it } from "vitest";

import {
  analyticsDateRange,
  defaultBackfillRange,
  metricCount,
  ratePercent,
} from "@/lib/growth/pinterest/analytics-contract";

describe("Pinterest analytics contract", () => {
  it("creates exactly 90 inclusive UTC dates for initial backfill", () => {
    expect(defaultBackfillRange(new Date("2026-10-05T23:00:00Z"))).toEqual({ startDate: "2026-07-08", endDate: "2026-10-05" });
  });

  it("accepts the official 90-day boundary and rejects older, future, reversed, and malformed dates", () => {
    const now = new Date("2026-10-05T12:00:00Z");
    expect(analyticsDateRange({ startDate: "2026-07-07", endDate: "2026-10-05", now }).startDate).toBe("2026-07-07");
    expect(() => analyticsDateRange({ startDate: "2026-07-06", endDate: "2026-10-05", now })).toThrow("lookback");
    expect(() => analyticsDateRange({ startDate: "2026-10-06", endDate: "2026-10-06", now })).toThrow("future");
    expect(() => analyticsDateRange({ startDate: "2026-10-05", endDate: "2026-10-04", now })).toThrow("must not follow");
    expect(() => analyticsDateRange({ startDate: "2026-02-30", endDate: "2026-03-01", now })).toThrow("Invalid");
  });

  it("normalizes omitted zero metrics, rejects malformed or unsupported metrics, and handles zero-impression CTR", () => {
    expect(metricCount({}, "IMPRESSION")).toBe(BigInt(0));
    expect(() => metricCount({ IMPRESSION: 1.5 }, "IMPRESSION")).toThrow("invalid");
    expect(() => metricCount({ CLICKTHROUGH: 1 }, "IMPRESSION")).toThrow("unsupported");
    expect(ratePercent(BigInt(8), BigInt(100))).toBe(8);
    expect(ratePercent(BigInt(8), BigInt(0))).toBe(0);
  });
});
