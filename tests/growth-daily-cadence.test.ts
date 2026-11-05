import { describe, expect, it } from "vitest";
import {
  DEFAULT_DAILY_CADENCE_POLICY,
  dailyCadencePolicySchema,
  decideDailyChannelCadence,
  planDailyGrowthCadence,
  type CadenceResources,
} from "@/lib/growth/portfolio/daily-cadence";

const ready: CadenceResources = {
  eligibleOpportunities: 15,
  performance: "STRONG",
  authorizedDailyLimit: 10,
  completedToday: 0,
  pendingToday: 0,
  budgetedAdditionalCapacity: 10,
  operationallyReady: true,
};

describe("Phase14K configurable daily cadence", () => {
  it("auto decides up to ten Pin creative drafts but obeys existing Translator cap", () => {
    const plan = planDailyGrowthCadence(DEFAULT_DAILY_CADENCE_POLICY, {
      pinCreatives: ready,
      translatorCreates: { ...ready, authorizedDailyLimit: 1,
        budgetedAdditionalCapacity: 1 },
      individuallyApprovedPinsDue: 0,
      publishedPinsToday: 0,
      translatorPublishGateEnabled: false,
      qualityApprovedTranslatorsReady: 0,
      publishedTranslatorsToday: 0,
    });
    expect(plan.pinCreativePlanning).toMatchObject({
      requestedToday: 10, additionalPlanned: 10, status: "READY",
    });
    expect(plan.translatorCreationPlanning).toMatchObject({
      requestedToday: 10, additionalPlanned: 1, status: "LIMITED",
    });
    expect(plan.eligiblePinPublications).toBe(0);
    expect(plan.eligibleTranslatorPublications).toBe(0);
    expect(plan.publishingAutomaticallyAuthorizesPins).toBe(false);
    expect(plan.productionExecutionAuthorized).toBe(false);
  });

  it("prioritizes a positive minimum without demanding ten pieces on a weak day", () => {
    const result = decideDailyChannelCadence(
      DEFAULT_DAILY_CADENCE_POLICY.pinCreatives,
      { ...ready, eligibleOpportunities: 2, performance: "WEAK" },
    );
    expect(result).toMatchObject({
      requestedToday: 1, additionalPlanned: 1, status: "READY",
    });
  });

  it("does not create filler content for the minimum when evidence is unavailable", () => {
    const noEvidence = decideDailyChannelCadence(
      DEFAULT_DAILY_CADENCE_POLICY.pinCreatives,
      { ...ready, eligibleOpportunities: 0 },
    );
    expect(noEvidence).toMatchObject({ requestedToday: 1,
      additionalPlanned: 0, status: "BLOCKED" });
    expect(noEvidence.reasons).toContain("NO_QUALIFIED_OPPORTUNITIES");
    const unknown = decideDailyChannelCadence(
      DEFAULT_DAILY_CADENCE_POLICY.translatorCreates,
      { ...ready, performance: "UNKNOWN" },
    );
    expect(unknown.additionalPlanned).toBe(0);
    expect(unknown.reasons).toContain("PERFORMANCE_UNVERIFIED");
  });

  it("respects reserved/in-flight tasks and hard budget capacity", () => {
    const result = decideDailyChannelCadence(
      DEFAULT_DAILY_CADENCE_POLICY.pinCreatives,
      { ...ready, completedToday: 5, pendingToday: 2,
        budgetedAdditionalCapacity: 1 },
    );
    expect(result).toMatchObject({
      requestedToday: 10, alreadyCommitted: 7,
      additionalPlanned: 1, status: "LIMITED",
    });
    expect(decideDailyChannelCadence(
      DEFAULT_DAILY_CADENCE_POLICY.pinCreatives,
      { ...ready, completedToday: 7, pendingToday: 3 },
    ).additionalPlanned).toBe(0);
  });

  it("fixed mode overrides the preferred amount but not the existing safety ceiling", () => {
    const fixed = { mode: "FIXED" as const, minimum: 1,
      maximum: 10, fixed: 7 };
    expect(decideDailyChannelCadence(fixed,
      { ...ready, authorizedDailyLimit: 3 })).toMatchObject({
      requestedToday: 7, additionalPlanned: 3, status: "LIMITED",
    });
    expect(decideDailyChannelCadence(fixed, ready)).toMatchObject({
      requestedToday: 7, additionalPlanned: 7, status: "READY",
    });
  });

  it("PAUSED is a deliberate owner action and never queues production work", () => {
    const paused = { mode: "PAUSED" as const, minimum: 1,
      maximum: 10, fixed: null };
    expect(decideDailyChannelCadence(paused, ready)).toMatchObject({
      requestedToday: 0, additionalPlanned: 0,
      status: "PAUSED", reasons: ["OWNER_PAUSED"],
    });
    const plan = planDailyGrowthCadence({
      ...DEFAULT_DAILY_CADENCE_POLICY,
      pinCreatives: paused,
      translatorCreates: paused,
    }, {
      pinCreatives: ready,
      translatorCreates: ready,
      individuallyApprovedPinsDue: 10,
      publishedPinsToday: 0,
      translatorPublishGateEnabled: true,
      qualityApprovedTranslatorsReady: 10,
      publishedTranslatorsToday: 0,
    });
    expect(plan.eligiblePinPublications).toBe(0);
    expect(plan.eligibleTranslatorPublications).toBe(0);
  });

  it("exposes preapproved Pins separately without inventing publication approval", () => {
    const plan = planDailyGrowthCadence(DEFAULT_DAILY_CADENCE_POLICY, {
      pinCreatives: ready, translatorCreates: ready,
      individuallyApprovedPinsDue: 12, publishedPinsToday: 3,
      translatorPublishGateEnabled: false,
      qualityApprovedTranslatorsReady: 4, publishedTranslatorsToday: 0,
    });
    expect(plan.eligiblePinPublications).toBe(7);
    expect(plan.eligibleTranslatorPublications).toBe(0);
    expect(plan.publishingAutomaticallyAuthorizesPins).toBe(false);
  });

  it("rejects malformed override limits and impossible resource counters", () => {
    expect(dailyCadencePolicySchema.safeParse({
      ...DEFAULT_DAILY_CADENCE_POLICY,
      pinCreatives: { mode: "AUTO", minimum: 10,
        maximum: 1, fixed: null },
    }).success).toBe(false);
    expect(dailyCadencePolicySchema.safeParse({
      ...DEFAULT_DAILY_CADENCE_POLICY,
      translatorCreates: { mode: "FIXED", minimum: 1,
        maximum: 10, fixed: null },
    }).success).toBe(false);
    expect(() => decideDailyChannelCadence(
      DEFAULT_DAILY_CADENCE_POLICY.translatorCreates,
      { ...ready, completedToday: -1 },
    )).toThrow("CADENCE_RESOURCE_INVALID");
  });
});
