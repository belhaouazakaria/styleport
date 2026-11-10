import { describe, expect, it } from "vitest";
import { planDailyRotation, utcDayIndex } from "@/lib/growth/portfolio/daily-rotation";
import { planViralPortfolio } from "@/lib/growth/viral/portfolio";

const account = [{
  id: "mainaccount", role: "SAYTWIST" as const,
  connected: true, hasWritableBoard: true,
}];
const policy = { mode: "ACTIVE" as const, sourceSharePercent: 50,
  maxPinsPerDay: 5 };

function plan(day: string) {
  const r = planDailyRotation(day, account);
  const e = {
    day, saytwistCommitted: 0, sourceCommitted: 0,
    hardDailyPinCap: r.targetPins,
    remainingProviderPublicationCapacity: 5,
    sourceConceptsQualified: 20, originalConceptsQualified: 20,
    sourcePublishingRightsVerified: true,
    rotatingTarget: { source: r.source, saytwist: r.original },
  };
  return { r, e, p: planViralPortfolio(policy, e) };
}

describe("daily rotated combined quota across source and SayTwist channels", () => {
  it("enforces daily four/five exact original and source split", () => {
    const start = utcDayIndex("2026-11-10");
    let sourceTotal = 0, originalTotal = 0;
    for (let i = 0; i < 8; i++) {
      const day = new Date((start+i)*86_400_000).toISOString().slice(0, 10);
      const { r, p } = plan(day);
      expect(p.target).toEqual({ source: r.source, saytwist: r.original });
      expect(p.additional).toEqual({ source: r.source, saytwist: r.original });
      expect(p.additional.source + p.additional.saytwist).toBe(r.targetPins);
      expect(p.pinPublicationAutomaticallyApproved).toBe(false);
      sourceTotal += r.source;
      originalTotal += r.original;
    }
    expect(Math.abs(sourceTotal - originalTotal)).toBeLessThanOrEqual(1);
  });
  it("never gives one channel the other channel's exhausted slots", () => {
    const { r, e } = plan("2026-11-10");
    const fullSource = planViralPortfolio(policy, {
      ...e, sourceCommitted: r.source,
    });
    expect(fullSource.additional.source).toBe(0);
    expect(fullSource.additional.saytwist).toBe(r.original);
  });
  it("rejects stale or mis-sized account-day split", () => {
    const { e } = plan("2026-11-10");
    expect(() => planViralPortfolio(policy, {
      ...e, rotatingTarget: { source: 2, saytwist: 7 },
    })).toThrow("VIRAL_ROTATION_SPLIT_INVALID");
  });
});
