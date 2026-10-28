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
  it("distinguishes provider billing from conservative reserved ceilings and prints all critical warnings", () => {
    const text = formatGrowthDailyDigest({
      ...data,
      aiReservedCents: 135,
      breakout: null,
      nextAction: null,
      warnings: [
        "Pinterest analytics partial",
        "Attribution evidence unavailable",
        "Growth AI actual spending not fully priced",
      ],
    });
    expect(text).toContain("Growth AI spend: Unavailable (billing not reconciled)");
    expect(text).toContain("Growth AI reserved ceiling: $1.35 USD (not billed spend)");
    expect(text).toContain("Growth AI actual spending not fully priced");
    expect(text).toContain("Breakout: Unavailable (no complete Pin-level evidence)");
    expect(text).not.toContain("No action recommended");
    expect(text.length).toBeLessThan(3500);
  });
  it("bounds long warning lists while signaling omissions", () => {
    const text = formatGrowthDailyDigest({
      ...data, warnings: Array.from({ length: 8 }, (_, i) => `Warning ${i + 1}`),
    });
    expect(text).toContain("Warning 5");
    expect(text).not.toContain("Warning 6");
    expect(text).toContain("plus 3 more warning(s) in the archive");
  });
  it("rejects unsafe report identifiers and dates", () => {
    expect(() => formatGrowthDailyDigest({ ...data, reportId: "../admin" })).toThrow();
    expect(() => formatGrowthDailyDigest({ ...data, date: "2026-10-18\nSecret" })).toThrow();
  });
});
