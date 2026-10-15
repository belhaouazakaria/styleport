import {
  GrowthCreativeArchetype,
  GrowthCreativeDestinationKind,
  GrowthEvergreenRecommendation,
  GrowthExperimentStatus,
  GrowthLearningEvidenceQuality,
  GrowthPublicationTimingMode,
} from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  learningExperimentActionSchema,
  prepareEvergreenRecommendationSchema,
} from "@/lib/growth/learning/contracts";
import { learningEvidenceWindow } from "@/lib/growth/learning/service";
import { evaluateEvergreenTarget } from "@/lib/growth/learning/evergreen";
import { evaluateExperiment } from "@/lib/growth/learning/experiments";
import { comparePerformance } from "@/lib/growth/learning/performance";
import {
  chooseLearnedWindow,
  evaluateLearnedWindows,
} from "@/lib/growth/learning/scheduler";
import { planPublicationTiming } from "@/lib/growth/publishing/timing";

const now = new Date("2026-10-15T12:00:00.000Z");
const base = {
  destinationKind: GrowthCreativeDestinationKind.TRANSLATOR,
  targetId: "translator-1",
  destinationPath: "/translators/warm",
  activeAndPublic: true,
  contentUpdatedAt: new Date("2026-01-01T00:00:00Z"),
  observedMetricDays: 30,
  impressions: 5_000,
  outboundClicks: 100,
  saves: 80,
  qualifiedConversions: null,
  attributionAvailable: false,
  lastPublishedAt: new Date("2026-07-01T00:00:00Z"),
  publicationCount: 2,
  activeEquivalentCount: 0,
  activeCandidateCount: 0,
  strongFatigue: false,
  analyticsFresh: true,
  unresolvedAccountIssue: false,
  meaningfulAngleAvailable: true,
  evidenceComplete: true,
  previousArchetypes: [GrowthCreativeArchetype.MINIMAL_STATEMENT],
};

describe("Phase 12 evergreen recommendations", () => {
  it("revives only proven, cooled-down public content with a genuinely different supported creative", () => {
    const result = evaluateEvergreenTarget(base, now);
    expect(result).toMatchObject({
      recommendation: GrowthEvergreenRecommendation.REVIVE,
      evidenceQuality: GrowthLearningEvidenceQuality.KNOWN,
      proposedArchetype: GrowthCreativeArchetype.BEFORE_AFTER,
    });
    expect(result.reasonCodes).toContain("ATTRIBUTION_NOT_COLLECTING");
  });

  it.each([
    [
      { activeEquivalentCount: 1 },
      GrowthEvergreenRecommendation.WAIT,
      "EQUIVALENT_ACTIVE_PUBLICATION",
    ],
    [
      { activeCandidateCount: 1 },
      GrowthEvergreenRecommendation.WAIT,
      "EQUIVALENT_ACTIVE_CANDIDATE",
    ],
    [
      { lastPublishedAt: new Date("2026-10-01T00:00:00Z") },
      GrowthEvergreenRecommendation.WAIT,
      "COOLDOWN_ACTIVE",
    ],
    [
      { strongFatigue: true },
      GrowthEvergreenRecommendation.SKIP,
      "STRONG_FATIGUE",
    ],
    [
      { unresolvedAccountIssue: true },
      GrowthEvergreenRecommendation.SKIP,
      "UNRESOLVED_ACCOUNT_ISSUE",
    ],
    [
      { activeAndPublic: false },
      GrowthEvergreenRecommendation.SKIP,
      "DESTINATION_NOT_PUBLIC",
    ],
    [
      { analyticsFresh: false },
      GrowthEvergreenRecommendation.INSUFFICIENT_DATA,
      "ANALYTICS_STALE",
    ],
    [
      { observedMetricDays: 2 },
      GrowthEvergreenRecommendation.INSUFFICIENT_DATA,
      "HISTORICAL_EVIDENCE_BELOW_MINIMUM",
    ],
  ])("fails conservatively for %o", (change, recommendation, reason) => {
    const result = evaluateEvergreenTarget({ ...base, ...change }, now);
    expect(result.recommendation).toBe(recommendation);
    expect(result.reasonCodes).toContain(reason);
  });

  it("does not offer a cosmetic Idea repost when its only supported archetype was already used", () => {
    const result = evaluateEvergreenTarget(
      {
        ...base,
        destinationKind: GrowthCreativeDestinationKind.IDEA,
        previousArchetypes: [GrowthCreativeArchetype.MINIMAL_STATEMENT],
      },
      now,
    );
    expect(result).toMatchObject({
      recommendation: GrowthEvergreenRecommendation.WAIT,
      proposedArchetype: null,
    });
    expect(result.reasonCodes).toContain("NO_MEANINGFULLY_DIFFERENT_ANGLE");
  });

  it("requires literal confirmation and rejects client-injected creative fields", () => {
    expect(
      prepareEvergreenRecommendationSchema.safeParse({
        recommendationId: "r1",
        confirmation: true,
      }).success,
    ).toBe(true);
    expect(
      prepareEvergreenRecommendationSchema.safeParse({
        recommendationId: "r1",
        confirmation: false,
      }).success,
    ).toBe(false);
    expect(
      prepareEvergreenRecommendationSchema.safeParse({
        recommendationId: "r1",
        confirmation: true,
        paidAiConfirmation: "yes",
      }).success,
    ).toBe(false);
    expect(
      prepareEvergreenRecommendationSchema.safeParse({
        recommendationId: "r1",
        confirmation: true,
        paidAiConfirmation: "QUEUE PAID AI CREATIVE",
      }).success,
    ).toBe(true);
    expect(
      prepareEvergreenRecommendationSchema.safeParse({
        recommendationId: "r1",
        confirmation: true,
        status: "APPROVED",
      }).success,
    ).toBe(false);
  });

  it("accepts only explicit controlled experiment actions", () => {
    expect(
      learningExperimentActionSchema.safeParse({
        experimentId: "experiment-1",
        action: "REQUEST_ANALYSIS",
        confirmation: true,
      }).success,
    ).toBe(true);
    expect(
      learningExperimentActionSchema.safeParse({
        experimentId: "experiment-1",
        action: "COMPLETE",
        confirmation: true,
      }).success,
    ).toBe(false);
    expect(
      learningExperimentActionSchema.safeParse({
        experimentId: "experiment-1",
        action: "FINALIZE",
        confirmation: true,
        winnerKey: "a",
      }).success,
    ).toBe(false);
  });
});

describe("Phase 12 performance, experiments, and learned scheduling", () => {
  it("aggregates every explicitly selected observation and reports incomplete selection", () => {
    const observations = Array.from({ length: 2_001 }, (_, index) => ({
      dimension: "topic",
      value: index === 2_000 ? "last" : "first",
      impressions: 500,
      outboundClicks: 20,
      saves: 10,
      qualifiedConversions: null,
    }));
    expect(comparePerformance(observations, false)).toHaveLength(2);
    expect(
      comparePerformance(observations, {
        attributionAvailable: false,
        evidenceComplete: false,
        incompletenessReasonCodes: ["PUBLICATION_CAP_EXHAUSTED"],
      })[0],
    ).toMatchObject({
      evidenceQuality: GrowthLearningEvidenceQuality.PARTIAL,
    });
    expect(
      comparePerformance(observations, {
        attributionAvailable: false,
        evidenceComplete: false,
        incompletenessReasonCodes: ["PUBLICATION_CAP_EXHAUSTED"],
      })[0].reasonCodes,
    ).toContain("PUBLICATION_CAP_EXHAUSTED");
  });

  it("normalizes performance by exposure and never maps unavailable conversion to zero", () => {
    const findings = comparePerformance(
      Array.from({ length: 3 }, () => ({
        dimension: "archetype",
        value: "MINIMAL",
        impressions: 500,
        outboundClicks: 20,
        saves: 10,
        qualifiedConversions: null,
      })),
      false,
    );
    expect(findings[0]).toMatchObject({
      outboundRate: 0.04,
      conversionRate: null,
      evidenceQuality: GrowthLearningEvidenceQuality.KNOWN,
    });
    expect(findings[0].qualifiedConversions).toBeNull();
  });

  it("penalizes small performance samples", () => {
    expect(
      comparePerformance(
        [
          {
            dimension: "weekday",
            value: "MON",
            impressions: 10,
            outboundClicks: 9,
            saves: 8,
            qualifiedConversions: null,
          },
        ],
        false,
      )[0],
    ).toMatchObject({
      evidenceQuality: GrowthLearningEvidenceQuality.INSUFFICIENT_DATA,
    });
  });

  it("keeps missing conversion null and penalizes a dominant outlier", () => {
    const findings = comparePerformance(
      [
        {
          dimension: "topic",
          value: "warm",
          impressions: 9_000,
          outboundClicks: 90,
          saves: 10,
          qualifiedConversions: null,
        },
        {
          dimension: "topic",
          value: "warm",
          impressions: 500,
          outboundClicks: 10,
          saves: 2,
          qualifiedConversions: null,
        },
        {
          dimension: "topic",
          value: "warm",
          impressions: 500,
          outboundClicks: 10,
          saves: 2,
          qualifiedConversions: null,
        },
      ],
      true,
    );
    expect(findings[0]).toMatchObject({
      qualifiedConversions: null,
      conversionRate: null,
      evidenceQuality: GrowthLearningEvidenceQuality.PARTIAL,
    });
    expect(findings[0].reasonCodes).toContain("OUTLIER_CONCENTRATION");
  });

  it("keeps immature and tied experiments inconclusive, and identifies only a mature material winner", () => {
    expect(
      evaluateExperiment([
        {
          key: "a",
          publications: 1,
          ageDays: 10,
          impressions: 900,
          outboundClicks: 90,
        },
        {
          key: "b",
          publications: 2,
          ageDays: 10,
          impressions: 900,
          outboundClicks: 30,
        },
      ]).outcome,
    ).toBe(GrowthExperimentStatus.INCONCLUSIVE);
    expect(
      evaluateExperiment([
        {
          key: "a",
          publications: 2,
          ageDays: 10,
          impressions: 1_000,
          outboundClicks: 50,
        },
        {
          key: "b",
          publications: 2,
          ageDays: 10,
          impressions: 1_000,
          outboundClicks: 48,
        },
      ]).winnerKey,
    ).toBeNull();
    expect(
      evaluateExperiment([
        {
          key: "a",
          publications: 2,
          ageDays: 10,
          impressions: 1_000,
          outboundClicks: 80,
        },
        {
          key: "b",
          publications: 2,
          ageDays: 10,
          impressions: 1_000,
          outboundClicks: 40,
        },
      ]),
    ).toMatchObject({
      outcome: GrowthExperimentStatus.COMPLETED,
      winnerKey: "a",
    });
  });

  it("does not declare an experiment winner from one dominant publication", () => {
    expect(
      evaluateExperiment([
        {
          key: "a",
          publications: 2,
          ageDays: 10,
          impressions: 2_000,
          outboundClicks: 150,
          topPublicationImpressionPercent: 90,
        },
        {
          key: "b",
          publications: 2,
          ageDays: 10,
          impressions: 2_000,
          outboundClicks: 50,
          topPublicationImpressionPercent: 50,
        },
      ]),
    ).toMatchObject({
      outcome: GrowthExperimentStatus.INCONCLUSIVE,
      evidenceQuality: GrowthLearningEvidenceQuality.PARTIAL,
      winnerKey: null,
    });
  });

  it("requires mature evidence for all three and four configured variants", () => {
    const mature = (key: string, outboundClicks: number) => ({
      key,
      publications: 2,
      ageDays: 10,
      impressions: 2_000,
      outboundClicks,
      topPublicationImpressionPercent: 50,
    });
    expect(
      evaluateExperiment([
        mature("a", 200),
        mature("b", 80),
        { ...mature("c", 40), publications: 0 },
      ]),
    ).toMatchObject({
      outcome: GrowthExperimentStatus.INCONCLUSIVE,
      winnerKey: null,
    });
    expect(
      evaluateExperiment([
        mature("a", 300),
        mature("b", 100),
        mature("c", 80),
        mature("d", 60),
      ]),
    ).toMatchObject({
      outcome: GrowthExperimentStatus.COMPLETED,
      winnerKey: "a",
    });
  });

  it("keeps low-conversion, unequal-exposure, and unavailable conversion experiments inconclusive", () => {
    const variants = [
      {
        key: "a",
        publications: 2,
        ageDays: 10,
        impressions: 5_000,
        outboundClicks: 100,
        qualifiedConversions: 2,
      },
      {
        key: "b",
        publications: 2,
        ageDays: 10,
        impressions: 1_000,
        outboundClicks: 30,
        qualifiedConversions: 1,
      },
    ];
    expect(evaluateExperiment(variants).reasonCodes).toContain(
      "UNEQUAL_EXPOSURE",
    );
    expect(
      evaluateExperiment(
        variants.map((variant) => ({
          ...variant,
          impressions: 2_000,
          qualifiedConversions: null,
        })),
        { primaryKpi: "QUALIFIED_CONVERSIONS", attributionAvailable: true },
      ).reasonCodes,
    ).toContain("CONVERSION_EVIDENCE_UNAVAILABLE");
  });

  it("uses a half-open UTC evidence window that includes the complete previous day", () => {
    expect(learningEvidenceWindow(new Date("2026-10-15T18:00:00Z"))).toEqual({
      start: new Date("2026-07-17T00:00:00.000Z"),
      endExclusive: new Date("2026-10-15T00:00:00.000Z"),
    });
  });

  it("keeps sparse windows on the US-first cold start and uses bounded deterministic exploration when qualified", () => {
    const sparse = evaluateLearnedWindows(
      [
        {
          localHour: 9,
          samplePins: 1,
          impressions: 200,
          outboundClicks: 20,
          saves: 5,
          qualifiedConversions: null,
        },
      ],
      false,
    );
    expect(
      chooseLearnedWindow({ stableKey: "cold", windows: sparse }),
    ).toMatchObject({
      localHour: null,
      mode: GrowthPublicationTimingMode.COLD_START,
    });
    const qualified = evaluateLearnedWindows(
      [
        {
          localHour: 9,
          samplePins: 6,
          impressions: 3_000,
          outboundClicks: 90,
          saves: 30,
          qualifiedConversions: null,
        },
        {
          localHour: 18,
          samplePins: 7,
          impressions: 3_000,
          outboundClicks: 150,
          saves: 40,
          qualifiedConversions: null,
        },
      ],
      false,
    );
    const choices = Array.from({ length: 100 }, (_, index) =>
      chooseLearnedWindow({ stableKey: `key-${index}`, windows: qualified }),
    );
    expect(
      choices.some(
        (choice) => choice.mode === GrowthPublicationTimingMode.EXPLOIT,
      ),
    ).toBe(true);
    expect(
      choices.some(
        (choice) => choice.mode === GrowthPublicationTimingMode.EXPLORE,
      ),
    ).toBe(true);
  });

  it("never promotes stale account evidence to a learned schedule", () => {
    const windows = evaluateLearnedWindows(
      [
        {
          localHour: 17,
          samplePins: 20,
          impressions: 20_000,
          outboundClicks: 2_000,
          saves: 500,
          qualifiedConversions: null,
        },
      ],
      false,
      false,
    );
    expect(windows[0]).toMatchObject({
      evidenceQuality: GrowthLearningEvidenceQuality.STALE,
      confidence: 0,
    });
    expect(chooseLearnedWindow({ stableKey: "stale", windows })).toMatchObject({
      localHour: null,
      mode: GrowthPublicationTimingMode.COLD_START,
    });
  });

  it("applies a learned hour through the DST-safe Phase 11 slot planner without changing approval data", () => {
    const result = planPublicationTiming({
      stableKey: "learned",
      now: new Date("2026-03-08T05:00:00Z"),
      history: [],
      learned: {
        localHour: 18,
        mode: GrowthPublicationTimingMode.EXPLOIT,
        confidence: 80,
        runId: "run-1",
      },
    });
    const hour = Number(
      new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York",
        hour: "2-digit",
        hourCycle: "h23",
      }).format(result.scheduledAt),
    );
    expect(result).toMatchObject({
      modelVersion: "learned_scheduler_v1",
      mode: GrowthPublicationTimingMode.EXPLOIT,
    });
    expect(hour).toBe(18);
  });

  it("preserves a learned non-default local hour across collisions and DST", () => {
    const first = planPublicationTiming({
      stableKey: "learned-17",
      now: new Date("2026-11-01T04:30:00Z"),
      history: [],
      learned: {
        localHour: 17,
        mode: GrowthPublicationTimingMode.EXPLOIT,
        confidence: 80,
        runId: "run-1",
      },
    });
    const moved = planPublicationTiming({
      stableKey: "learned-17",
      now: new Date("2026-11-01T04:30:00Z"),
      history: [],
      collisions: [{ scheduledAt: first.scheduledAt }],
      learned: {
        localHour: 17,
        mode: GrowthPublicationTimingMode.EXPLOIT,
        confidence: 80,
        runId: "run-1",
      },
    });
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(moved.scheduledAt);
    expect(Number(parts)).toBe(17);
    expect(moved.scheduledAt.getTime()).toBeGreaterThan(
      first.scheduledAt.getTime(),
    );
  });
});
