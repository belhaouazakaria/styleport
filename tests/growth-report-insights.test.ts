import { describe, expect, it } from "vitest";
import { deriveDailyGrowthInsights } from "@/lib/growth/reporting/insights";

describe("Evidence-gated deterministic Growth report insights", () => {
  const topPin = { title: "Jester translator", outboundClicks: 35 };

  it("blocks breakout promotion from incomplete Pinterest coverage", () => {
    expect(deriveDailyGrowthInsights({
      pinterestComplete: false, attributionComplete: true, topPin,
    })).toEqual({
      breakout: null,
      nextAction: "Review Pinterest analytics coverage before drawing performance conclusions.",
    });
  });

  it("uses a top Pin only with explicitly complete Pinterest evidence", () => {
    const result = deriveDailyGrowthInsights({
      pinterestComplete: true, attributionComplete: true, topPin,
    });
    expect(result.breakout).toContain("Jester translator (35 outbound clicks)");
    expect(result.nextAction).toContain("individual approval");
  });

  it("blocks unsupported lift claims, action proposals and zero-click winners", () => {
    const result = deriveDailyGrowthInsights({
      pinterestComplete: true, attributionComplete: false, topPin,
    });
    expect(result.nextAction).toContain("attribution readiness");
    expect(result.nextAction).not.toContain("publish");
    expect(deriveDailyGrowthInsights({
      pinterestComplete: true, attributionComplete: true,
      topPin: { title: "Zero", outboundClicks: 0 },
    }).breakout).toBeNull();
  });
});
