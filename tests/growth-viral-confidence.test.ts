// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  classifyViralOpportunity,
  evaluateViralWinner,
  wilsonBounds,
} from "@/lib/growth/viral/winners";
const now = new Date("2026-11-15T12:00:00Z");
const metrics = {
  impressions: 3000,
  saves: 180,
  outboundClicks: 90,
  publishedAt: new Date("2026-11-01"),
  measuredAt: now,
  baselineSaveRate: 0.018,
  baselineOutboundRate: 0.01,
  pinterestDataStatus: "READY" as const,
};
describe("Viral statistical qualification", () => {
  it("rejects point-estimate lift without confidence", () => {
    expect(
      evaluateViralWinner(
        { ...metrics, impressions: 600, saves: 18, outboundClicks: 9 },
        now,
      ).status,
    ).toBe("NOT_WINNING");
  });
  it("requires persistent evidence across separate dates", () => {
    expect(classifyViralOpportunity(metrics, null, now).stage).toBe(
      "PROMISING",
    );
    expect(
      classifyViralOpportunity(
        metrics,
        {
          ...metrics,
          impressions: 2000,
          saves: 120,
          outboundClicks: 60,
          measuredAt: new Date(now.getTime() - 86400000),
        },
        now,
      ).stage,
    ).toBe("HIGH_CONFIDENCE_WINNER");
    expect(
      classifyViralOpportunity(
        metrics,
        { ...metrics, measuredAt: new Date(now.getTime() - 60000) },
        now,
      ).stage,
    ).toBe("PROMISING");
  });
  it("does not call decreasing/reset counters a persistent winner", () => {
    expect(
      classifyViralOpportunity(
        metrics,
        {
          ...metrics,
          impressions: 5000,
          measuredAt: new Date(now.getTime() - 86400000),
        },
        now,
      ).stage,
    ).not.toBe("HIGH_CONFIDENCE_WINNER");
  });
  it("bounds edge cases and rejects invalid samples", () => {
    expect(wilsonBounds(0, 100).lower).toBe(0);
    expect(wilsonBounds(100, 100).upper).toBeLessThanOrEqual(1);
    expect(() => wilsonBounds(2, 1)).toThrow();
  });
});
