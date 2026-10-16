import { describe, expect, it } from "vitest";

import {
  assessPinterestRecoveryRateLimit,
  defaultPinterestRecoveryRange,
  detectPinterestAnalyticsGaps,
  pinterestRecoveryDateRange,
} from "@/lib/growth/pinterest/analytics-recovery";

function pin(
  pinterestPinId: string,
  metrics: Array<[string, string]>,
  publishedAt: Date | null = new Date("2026-10-01T18:00:00Z"),
) {
  return {
    id: `pin-${pinterestPinId}`,
    pinterestPinId,
    publishedAt,
    dailyMetrics: metrics.map(([date, dataStatus]) => ({
      metricDate: new Date(`${date}T00:00:00.000Z`),
      dataStatus,
    })),
  };
}

describe("Pinterest analytics gap recovery planning", () => {
  it("uses the last 90 completed UTC days and rejects the current day", () => {
    const now = new Date("2026-10-16T00:30:00Z");
    expect(defaultPinterestRecoveryRange(now)).toEqual({
      startDate: "2026-07-18",
      endDate: "2026-10-15",
    });
    expect(() =>
      pinterestRecoveryDateRange({
        startDate: "2026-10-15",
        endDate: "2026-10-16",
        now,
      }),
    ).toThrow("completed UTC dates");
  });

  it("merges overlapping missing and PROCESSING days into minimal ranges", () => {
    const result = detectPinterestAnalyticsGaps({
      startDate: "2026-10-04",
      endDate: "2026-10-08",
      pins: [
        pin("100", [
          ["2026-10-04", "PROCESSING"],
          ["2026-10-05", "READY"],
          ["2026-10-07", "PROCESSING"],
        ]),
        pin("200", [
          ["2026-10-04", "READY"],
          ["2026-10-05", "PROCESSING"],
          ["2026-10-06", "PROCESSING"],
          ["2026-10-07", "READY"],
          ["2026-10-08", "READY"],
        ]),
      ],
    });
    expect(result.tasks).toEqual([
      expect.objectContaining({
        pinterestPinId: "100",
        startDate: "2026-10-04",
        endDate: "2026-10-04",
        processingDates: ["2026-10-04"],
      }),
      expect.objectContaining({
        pinterestPinId: "100",
        startDate: "2026-10-06",
        endDate: "2026-10-08",
        missingDates: ["2026-10-06", "2026-10-08"],
        processingDates: ["2026-10-07"],
      }),
      expect.objectContaining({
        pinterestPinId: "200",
        startDate: "2026-10-05",
        endDate: "2026-10-06",
        processingDates: ["2026-10-05", "2026-10-06"],
      }),
    ]);
    expect(result.dates.find((row) => row.date === "2026-10-06")).toEqual({
      date: "2026-10-06",
      missingPins: 1,
      processingPins: 1,
    });
  });

  it("does not require pre-publication dates or retry permanent provider statuses", () => {
    const result = detectPinterestAnalyticsGaps({
      startDate: "2026-10-01",
      endDate: "2026-10-05",
      pins: [
        pin(
          "300",
          [
            ["2026-10-03", "BEFORE_PIN_CREATED"],
            ["2026-10-04", "READY"],
          ],
          new Date("2026-10-03T18:00:00Z"),
        ),
      ],
    });
    expect(result.tasks).toEqual([
      expect.objectContaining({
        pinterestPinId: "300",
        startDate: "2026-10-05",
        endDate: "2026-10-05",
        missingDates: ["2026-10-05"],
      }),
    ]);
  });

  it("starts on the first complete UTC day strictly after publication", () => {
    for (const publishedAt of [
      new Date("2026-10-03T00:00:00.000Z"),
      new Date("2026-10-03T23:59:59.999Z"),
    ]) {
      const result = detectPinterestAnalyticsGaps({
        startDate: "2026-10-01",
        endDate: "2026-10-05",
        pins: [pin("boundary", [], publishedAt)],
      });
      expect(result.tasks).toEqual([
        expect.objectContaining({
          startDate: "2026-10-04",
          endDate: "2026-10-05",
          missingDates: ["2026-10-04", "2026-10-05"],
        }),
      ]);
      expect(result.dates.map((row) => row.date)).toEqual([
        "2026-10-04",
        "2026-10-05",
      ]);
    }
  });

  it("requires fresh reliable quota metadata and preserves the five-request reserve", () => {
    const now = new Date("2026-10-16T12:00:00.000Z");
    const reset = String(Math.floor((now.getTime() + 3_600_000) / 1000));
    expect(
      assessPinterestRecoveryRateLimit(
        {
          lastRateLimitRemaining: "6",
          lastRateLimitReset: reset,
          rateLimitObservedAt: new Date(now.getTime() - 60_000),
        },
        now,
      ),
    ).toMatchObject({ status: "AVAILABLE", remaining: 6 });
    expect(
      assessPinterestRecoveryRateLimit(
        {
          lastRateLimitRemaining: "5",
          lastRateLimitReset: reset,
          rateLimitObservedAt: now,
        },
        now,
      ),
    ).toMatchObject({ status: "WAIT", remaining: 5 });
    expect(
      assessPinterestRecoveryRateLimit(
        {
          lastRateLimitRemaining: "60",
          lastRateLimitReset: reset,
          rateLimitObservedAt: new Date(now.getTime() - 16 * 60_000),
        },
        now,
      ),
    ).toEqual({ status: "UNRELIABLE", reason: "RATE_LIMIT_METADATA_STALE" });
    expect(
      assessPinterestRecoveryRateLimit(
        {
          lastRateLimitRemaining: "unknown",
          lastRateLimitReset: null,
          rateLimitObservedAt: now,
        },
        now,
      ),
    ).toEqual({ status: "UNRELIABLE", reason: "RATE_LIMIT_METADATA_INVALID" });
  });
});
