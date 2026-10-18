import { describe, expect, it } from "vitest";
import { formatGrowthWhatsAppDigest, type GrowthDigestData } from "@/lib/growth/reporting/digest";

const base: GrowthDigestData = {
  date: "2026-10-18",
  pinterestLandingSessions: null,
  qualifiedConversions: null,
  outboundClicks: 15,
  pinsPublished: 2,
  newTranslators: 0,
  newIdeas: 0,
  aiSpendUsd: null,
  breakout: "Jester translator",
  warnings: ["Pinterest analytics partial"],
  nextAction: "Review candidate Pins",
  reportId: "report-abc",
};

describe("WhatsApp Growth digest", () => {
  it("labels incomplete attribution and unpriced costs instead of inventing zeroes", () => {
    const message = formatGrowthWhatsAppDigest(base);
    expect(message).toContain("Pinterest landings: Unavailable");
    expect(message).toContain("Qualified translations: Unavailable");
    expect(message).toContain("Growth AI spend: Unavailable");
    expect(message).toContain("Pins published: 2");
    expect(message).toContain("https://saytwist.com/admin/growth/reports/report-abc");
  });
  it("produces a compact UTC report", () => {
    const message = formatGrowthWhatsAppDigest({ ...base, aiSpendUsd: 0.32 });
    expect(message).toContain("SayTwist Growth · 2026-10-18 (UTC)");
    expect(message).toContain("$0.32 USD");
    expect(message.length).toBeLessThan(3500);
  });
  it("rejects untrusted URL identifiers and dates", () => {
    expect(() => formatGrowthWhatsAppDigest({ ...base, reportId: "../admin" })).toThrow();
    expect(() => formatGrowthWhatsAppDigest({ ...base, date: "2026-10-18\nSecret" })).toThrow();
  });
});
