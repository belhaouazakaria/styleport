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

  it("anchors reset=35 seconds to the observation time and allows available quota", () => {
    const now = new Date("2026-10-16T12:00:00.000Z");
    const observedAt = new Date("2026-10-16T11:59:50.000Z");
    expect(
      assessPinterestRecoveryRateLimit(
        {
          lastRateLimitRemaining: "6",
          lastRateLimitReset: "35",
          rateLimitObservedAt: observedAt,
        },
        now,
      ),
    ).toEqual({
      status: "AVAILABLE",
      remaining: 6,
      resetAt: new Date("2026-10-16T12:00:25.000Z"),
    });
  });

  it("waits at the five-request reserve and for an exhausted budget", () => {
    const now = new Date("2026-10-16T12:00:00.000Z");
    const state = {
      lastRateLimitReset: "35",
      rateLimitObservedAt: now,
    };
    expect(
      assessPinterestRecoveryRateLimit(
        { ...state, lastRateLimitRemaining: "5" },
        now,
      ),
    ).toMatchObject({ status: "WAIT", remaining: 5 });
    expect(
      assessPinterestRecoveryRateLimit(
        { ...state, lastRateLimitRemaining: "0" },
        now,
      ),
    ).toMatchObject({ status: "WAIT", remaining: 0 });
  });

  it("rejects an expired reset deadline", () => {
    const now = new Date("2026-10-16T12:00:00.000Z");
    expect(
      assessPinterestRecoveryRateLimit(
        {
          lastRateLimitRemaining: "60",
          lastRateLimitReset: "35",
          rateLimitObservedAt: new Date("2026-10-16T11:59:20.000Z"),
        },
        now,
      ),
    ).toEqual({
      status: "UNRELIABLE",
      reason: "RATE_LIMIT_RESET_EXPIRED",
    });
  });

  it("rejects stale metadata even when its reset delta is otherwise valid", () => {
    const now = new Date("2026-10-16T12:00:00.000Z");
    expect(
      assessPinterestRecoveryRateLimit(
        {
          lastRateLimitRemaining: "60",
          lastRateLimitReset: "3600",
          rateLimitObservedAt: new Date(now.getTime() - 16 * 60_000),
        },
        now,
      ),
    ).toEqual({ status: "UNRELIABLE", reason: "RATE_LIMIT_METADATA_STALE" });
  });

  it.each([null, "", "-1", "1.5", "abc", "90000"])(
    "rejects invalid reset delta %s",
    (lastRateLimitReset) => {
      const now = new Date("2026-10-16T12:00:00.000Z");
      expect(
        assessPinterestRecoveryRateLimit(
          {
            lastRateLimitRemaining: "60",
            lastRateLimitReset,
            rateLimitObservedAt: now,
          },
          now,
        ),
      ).toEqual({
        status: "UNRELIABLE",
        reason: "RATE_LIMIT_METADATA_INVALID",
      });
    },
  );

  it.each([null, "", "-1", "1.5", "unknown"])(
    "rejects invalid remaining quota %s",
    (lastRateLimitRemaining) => {
      const now = new Date("2026-10-16T12:00:00.000Z");
      expect(
        assessPinterestRecoveryRateLimit(
          {
            lastRateLimitRemaining,
            lastRateLimitReset: "35",
            rateLimitObservedAt: now,
          },
          now,
        ),
      ).toEqual({
        status: "UNRELIABLE",
        reason: "RATE_LIMIT_METADATA_INVALID",
      });
    },
  );

  it("rejects missing observation metadata", () => {
    expect(assessPinterestRecoveryRateLimit(null)).toEqual({
      status: "UNRELIABLE",
      reason: "RATE_LIMIT_METADATA_MISSING",
    });
  });
});
