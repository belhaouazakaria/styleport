import { describe, expect, it } from "vitest";
import { evaluateMarketGaps } from "@/lib/growth/market-research/gaps";
import { planProactiveMarketResearch } from "@/lib/growth/market-research/cadence";
import type { MarketTrend } from "@/lib/growth/market-research/pinterest-trends";

const now = new Date("2026-11-05T12:00:00Z");
const trend = (keyword: string, pct = 110): MarketTrend => ({
  keyword, provider: "PINTEREST_TRENDS", region: "US",
  weekOverWeek: pct, monthOverMonth: 90, yearOverYear: 30,
  observedAt: now.toISOString(),
});

describe("market research quality and safety", () => {
  it("finds novel relevant ideas and keeps publication forbidden", () => {
    const report = evaluateMarketGaps({
      now, trends: [trend("funny texting personality quiz"),
        trend("birthday caption ideas"), trend("winter nail polish"),
        trend("gen z slang expressions")],
      translatorTitles: ["Gen Z Slang Expressions"],
      ideaTitles: ["Holiday greeting card ideas"],
    });
    expect(report.inspected).toBe(4);
    expect(report.coveredAlready).toBe(1);
    expect(report.signals.map(x => x.role)).toEqual([
      "SAYTWIST_PLAYGROUND", "SAYTWIST_IDEAS",
    ]);
    expect(report.signals.every(x =>
      x.status === "PROPOSED_FOR_EDITORIAL_REVIEW")).toBe(true);
    expect(report.createsNewContent).toBe(false);
    expect(report.publishesPins).toBe(false);
  });

  it("rejects stale or unknown data rather than treating it as market evidence", () => {
    expect(() => evaluateMarketGaps({ now, trends: [
      { ...trend("birthday messages"),
        observedAt: "2026-10-01T00:00:00Z" }],
      translatorTitles: [], ideaTitles: [],
    })).toThrow("MARKET_EVIDENCE_STALE");
    expect(() => evaluateMarketGaps({ now, trends: [
      { ...trend("birthday messages"),
        provider: "OTHER_SOURCE" as MarketTrend["provider"] }],
      translatorTitles: [], ideaTitles: [],
    })).toThrow("MARKET_SOURCE_UNTRUSTED");
  });

  it("researches shortages quickly and also periodically with a full backlog", () => {
    const basics = {
      now, approvedSourceAvailable: true,
      conservativePinterestBudgetAvailable: true,
      internalEligibleOpportunities: 20,
      desiredDailyCandidateMinimum: 1,
    };
    expect(planProactiveMarketResearch({
      ...basics, lastCompletedScanAt: null,
    }).reason).toBe("PERIODIC_MARKET_SCAN");
    expect(planProactiveMarketResearch({
      ...basics, internalEligibleOpportunities: 0,
      lastCompletedScanAt: new Date("2026-11-04T11:00:00Z"),
    }).reason).toBe("INTERNAL_OPPORTUNITY_SHORTFALL");
    expect(planProactiveMarketResearch({
      ...basics,
      lastCompletedScanAt: new Date("2026-11-03T11:00:00Z"),
    }).decision).toBe("NOT_DUE");
    expect(planProactiveMarketResearch({
      ...basics, approvedSourceAvailable: false,
      lastCompletedScanAt: null,
    }).reason).toBe("NO_PROVIDER_ACCESS");
  });
});
