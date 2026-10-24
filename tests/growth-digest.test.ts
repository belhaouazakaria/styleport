import { describe, expect, it } from "vitest";
import { formatGrowthDailyDigest, type GrowthDigestData } from "@/lib/growth/reporting/digest";

const data: GrowthDigestData = {
  date: "2026-10-18", pinterestLandingSessions: null, qualifiedConversions: null,
  outboundClicks: 15, pinsPublished: 2, newTranslators: 0, newIdeas: 0,
  aiSpendUsd: null, breakout: "Jester translator", warnings: ["Pinterest analytics partial"],
  nextAction: "Review candidate Pins", reportId: "report-abc",
};
describe("Provider-independent daily Growth digest", () => {
  it("never invents attribution or spend evidence", () => {
    const text = formatGrowthDailyDigest(data);
    expect(text).toContain("Pinterest landings: Unavailable");
    expect(text).toContain("Growth AI spend: Unavailable");
    expect(text).toContain("Pins published: 2");
    expect(text).toContain("https://saytwist.com/admin/growth/reports/report-abc");
  });
  it("uses compact UTC plain-text output", () => {
    const text = formatGrowthDailyDigest({ ...data, aiSpendUsd: 0.32 });
    expect(text).toContain("SayTwist Growth · 2026-10-18 (UTC)");
    expect(text).toContain("$0.32 USD");
    expect(text).not.toContain("*SayTwist");
    expect(text.length).toBeLessThan(3500);
  });
  it("rejects unsafe report identifiers and dates", () => {
    expect(() => formatGrowthDailyDigest({ ...data, reportId: "../admin" })).toThrow();
    expect(() => formatGrowthDailyDigest({ ...data, date: "2026-10-18\nSecret" })).toThrow();
  });
});
