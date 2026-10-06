import {
  GrowthOpportunityType,
  GrowthPinSignalType,
  GrowthSignalStrength,
} from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  clusterPins,
  lexicalTokens,
  translatorSlugFromUrl,
} from "@/lib/growth/opportunity/clustering";
import { opportunityWindow } from "@/lib/growth/opportunity/constants";
import {
  aggregateClusterMetrics,
  classifyPinSignals,
  hasIncompleteSignalWindow,
  qualifyClusterOpportunities,
  type DailyMetric,
} from "@/lib/growth/opportunity/metrics";
import { scoreOpportunity } from "@/lib/growth/opportunity/scoring";
import { NullTrendProvider } from "@/lib/growth/opportunity/trends";
const end = new Date("2026-10-05T00:00:00Z");
function pinRows(
  pinId: string,
  input: {
    olderI?: number;
    olderO?: number;
    previousI?: number;
    previousO?: number;
    previousS?: number;
    recentI?: number;
    recentO?: number;
    recentS?: number;
    omitRecent?: boolean;
  } = {},
): DailyMetric[] {
  const rows: DailyMetric[] = [];
  for (let day = 0; day < 28; day++) {
    if (input.omitRecent && day >= 21) continue;
    const metricDate = new Date("2026-09-08T00:00:00Z");
    metricDate.setUTCDate(metricDate.getUTCDate() + day);
    const period = day >= 21 ? "recent" : day >= 14 ? "previous" : "older";
    const impressions = input[`${period}I` as keyof typeof input] as
      number | undefined;
    const outbound = input[`${period}O` as keyof typeof input] as
      number | undefined;
    const saves =
      period === "recent"
        ? input.recentS
        : period === "previous"
          ? input.previousS
          : 1;
    rows.push({
      pinId,
      metricDate,
      impressions: BigInt(impressions ?? 100),
      saves: BigInt(saves ?? 2),
      pinClicks: BigInt(outbound ?? 2),
      outboundClicks: BigInt(outbound ?? 2),
    });
  }
  return rows;
}
const aggregate = (rows: DailyMetric[], ids = ["a"]) =>
  aggregateClusterMetrics(rows, ids, end);
describe("Phase 7 hardened deterministic signals", () => {
  it("uses the last 28 complete UTC days", () =>
    expect(
      opportunityWindow(new Date("2026-10-06T23:59:00-07:00")),
    ).toMatchObject({
      analysisDate: new Date("2026-10-07T00:00:00Z"),
      evidenceWindowStart: new Date("2026-09-09T00:00:00Z"),
      evidenceWindowEnd: new Date("2026-10-06T00:00:00Z"),
    }));
  it("extracts canonical slugs, removes boilerplate and clusters stably", () => {
    expect(
      translatorSlugFromUrl("https://saytwist.com/translators/Gen-Z/?x=1"),
    ).toBe("gen-z");
    expect(
      lexicalTokens(
        "SayTwist text translator for your Pinterest pin bold slang",
      ),
    ).toEqual(["bold", "slang"]);
    const pins = [
      {
        id: "2",
        pinterestPinId: "2",
        title: "Gen Z slang",
        description: null,
        destinationUrl: "https://saytwist.com/translators/gen-z",
        role: null,
      },
      {
        id: "1",
        pinterestPinId: "1",
        title: "Gen Z captions",
        description: null,
        destinationUrl: "https://saytwist.com/translators/gen-z",
        role: null,
      },
    ];
    expect(clusterPins(pins)).toEqual(clusterPins([...pins].reverse()));
  });
  it("allows a sustained strong single Pin winner signal", () =>
    expect(
      classifyPinSignals(aggregate(pinRows("a"))).map((s) => s.type),
    ).toContain(GrowthPinSignalType.WINNER));
  it("does not let one dominant winner establish a cluster opportunity", () => {
    const a = aggregate(
      pinRows("a", {
        olderI: 1000,
        olderO: 100,
        previousI: 1000,
        previousO: 100,
        recentI: 1000,
        recentO: 100,
      }),
    );
    const b = aggregate(
      pinRows("b", {
        olderI: 1,
        olderO: 0,
        previousI: 1,
        previousO: 0,
        recentI: 1,
        recentO: 0,
      }),
    );
    const combined = aggregate(
      [
        ...pinRows("a", {
          olderI: 1000,
          olderO: 100,
          previousI: 1000,
          previousO: 100,
          recentI: 1000,
          recentO: 100,
        }),
        ...pinRows("b", {
          olderI: 1,
          olderO: 0,
          previousI: 1,
          previousO: 0,
          recentI: 1,
          recentO: 0,
        }),
      ],
      ["a", "b"],
    );
    expect(
      qualifyClusterOpportunities({
        metrics: combined,
        pinMetrics: [a, b],
        pinCount: 2,
        destinations: 1,
        stale: false,
      }),
    ).not.toContain(GrowthOpportunityType.AMPLIFY_WINNER);
    expect(combined.topPinOutboundPercent).toBeGreaterThan(90);
  });
  it("allows multi-Pin sustained evidence to establish a winner opportunity", () => {
    const rows = [...pinRows("a"), ...pinRows("b")];
    const pins = [aggregate(pinRows("a")), aggregate(pinRows("b"), ["b"])];
    expect(
      qualifyClusterOpportunities({
        metrics: aggregate(rows, ["a", "b"]),
        pinMetrics: pins,
        pinCount: 2,
        destinations: 2,
        stale: false,
      }),
    ).toContain(GrowthOpportunityType.AMPLIFY_WINNER);
  });
  it("rejects impression-only winner traffic", () =>
    expect(
      classifyPinSignals(
        aggregate(pinRows("a", { olderO: 0, previousO: 0, recentO: 0 })),
      ).map((s) => s.type),
    ).not.toContain(GrowthPinSignalType.WINNER));
  it("classifies rising when impressions and clicks rise", () =>
    expect(
      classifyPinSignals(
        aggregate(
          pinRows("a", {
            previousI: 50,
            previousO: 1,
            recentI: 100,
            recentO: 3,
          }),
        ),
      ).map((s) => s.type),
    ).toContain(GrowthPinSignalType.RISING));
  it("rejects rising reach when CTR collapses", () =>
    expect(
      classifyPinSignals(
        aggregate(
          pinRows("a", {
            previousI: 50,
            previousO: 2,
            recentI: 100,
            recentO: 2,
          }),
        ),
      ).map((s) => s.type),
    ).not.toContain(GrowthPinSignalType.RISING));
  it("accepts strong outbound growth with moderate reach growth", () =>
    expect(
      classifyPinSignals(
        aggregate(
          pinRows("a", {
            previousI: 100,
            previousO: 2,
            recentI: 120,
            recentO: 4,
          }),
        ),
      ).map((s) => s.type),
    ).toContain(GrowthPinSignalType.RISING));
  it("rejects zero-to-trivial traffic and keeps zero rates unavailable", () => {
    const metrics = aggregate(
      pinRows("a", { previousI: 0, previousO: 0, recentI: 10, recentO: 0 }),
    );
    expect(metrics.previousCtrBasisPoints).toBeNull();
    expect(metrics.ctrChangePercent).toBeNull();
    expect(classifyPinSignals(metrics).map((s) => s.type)).not.toContain(
      GrowthPinSignalType.RISING,
    );
  });
  it("classifies supported impressions and click decline as strong fatigue", () =>
    expect(
      classifyPinSignals(
        aggregate(
          pinRows("a", {
            previousI: 100,
            previousO: 4,
            recentI: 40,
            recentO: 1,
          }),
        ),
      ).find((s) => s.type === GrowthPinSignalType.FATIGUE)?.strength,
    ).toBe(GrowthSignalStrength.STRONG));
  it("makes fatigue cautious when reach falls but CTR improves", () =>
    expect(
      classifyPinSignals(
        aggregate(
          pinRows("a", {
            previousI: 100,
            previousO: 2,
            recentI: 40,
            recentO: 1,
          }),
        ),
      ).find((s) => s.type === GrowthPinSignalType.FATIGUE)?.strength,
    ).toBe(GrowthSignalStrength.CAUTIOUS));
  it("rejects fatigue with weak prior volume or missing recent data", () => {
    expect(
      classifyPinSignals(
        aggregate(
          pinRows("a", { previousI: 20, previousO: 1, recentI: 1, recentO: 0 }),
        ),
      ).map((s) => s.type),
    ).not.toContain(GrowthPinSignalType.FATIGUE);
    const incomplete = aggregate(
      pinRows("a", { previousI: 100, previousO: 4, omitRecent: true }),
    );
    expect(hasIncompleteSignalWindow(incomplete)).toBe(true);
    expect(classifyPinSignals(incomplete).map((s) => s.type)).not.toContain(
      GrowthPinSignalType.FATIGUE,
    );
  });
  it("requires multi-Pin depth for inventory gaps", () => {
    const one = aggregate(
      pinRows("a", { olderO: 5, previousO: 5, recentO: 5 }),
    );
    expect(
      qualifyClusterOpportunities({
        metrics: one,
        pinMetrics: [one],
        pinCount: 1,
        destinations: 1,
        stale: false,
      }),
    ).not.toContain(GrowthOpportunityType.FILL_INVENTORY_GAP);
  });
  it("applies concentration to score and confidence", () => {
    const balanced = aggregate([...pinRows("a"), ...pinRows("b")], ["a", "b"]);
    const concentrated = aggregate(
      [
        ...pinRows("a", { olderO: 100, previousO: 100, recentO: 100 }),
        ...pinRows("b", { olderO: 1, previousO: 1, recentO: 1 }),
      ],
      ["a", "b"],
    );
    const base = {
      type: GrowthOpportunityType.AMPLIFY_WINNER,
      pinCount: 2,
      destinationCount: 2,
      evidencePartial: false,
      stale: false,
      qualifiedConversions: null,
    };
    const a = scoreOpportunity({ ...base, metrics: balanced }),
      b = scoreOpportunity({ ...base, metrics: concentrated });
    expect(b.components.concentrationPenalty).toBe(15);
    expect(b.confidence).toBeLessThan(a.confidence);
    expect(b.score).toBeGreaterThanOrEqual(0);
    expect(b.score).toBeLessThanOrEqual(100);
  });
  it("renormalizes missing conversion and keeps cost unavailable", () => {
    const score = scoreOpportunity({
      type: GrowthOpportunityType.AMPLIFY_WINNER,
      metrics: aggregate(pinRows("a")),
      pinCount: 2,
      destinationCount: 2,
      evidencePartial: false,
      stale: false,
      qualifiedConversions: null,
    });
    expect(score.components.conversion).toBeNull();
    expect(score.components.costState).toBe("NOT_APPLICABLE");
    expect(
      Object.values(score.components)
        .filter((v) => typeof v === "number")
        .every((v) => Number.isFinite(v) && v >= 0 && v <= 100),
    ).toBe(true);
  });
  it("reduces confidence for stale or partial evidence", () => {
    const metrics = aggregate(pinRows("a"));
    const base = {
      type: GrowthOpportunityType.AMPLIFY_WINNER,
      metrics,
      pinCount: 2,
      destinationCount: 2,
      qualifiedConversions: null,
    };
    expect(
      scoreOpportunity({ ...base, evidencePartial: true, stale: true })
        .confidence,
    ).toBeLessThan(
      scoreOpportunity({ ...base, evidencePartial: false, stale: false })
        .confidence,
    );
  });
  it("uses a no-network null trend provider", async () =>
    expect(
      await new NullTrendProvider().getSignal({
        clusterKey: "x",
        start: end,
        end,
      }),
    ).toEqual({ state: "NOT_APPLICABLE", score: null }));
});
