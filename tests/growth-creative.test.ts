import { createHash } from "node:crypto";
import {
  GrowthCreativeArchetype,
  GrowthCreativeDestinationKind,
  GrowthCreativeSimilarityClassification,
  GrowthPinCandidateStatus,
} from "@prisma/client";
import { describe, expect, it } from "vitest";

import { createCreativeAiImageBudget } from "@/lib/growth/creative/ai-image-provider";
import { DETERMINISTIC_ARCHETYPES, STATIC_RENDERER_DEFINITIONS } from "@/lib/growth/creative/constants";
import { creativeGenerationJobPayloadSchema, createExperimentSchema } from "@/lib/growth/creative/contracts";
import { getCreativeRendererDefinition, renderDeterministicCreative } from "@/lib/growth/creative/renderer";
import { classifyCreativeSimilarity } from "@/lib/growth/creative/similarity";
import { readPngDimensions, resolveCreativeAssetFile } from "@/lib/growth/creative/storage";

const copy = {
  title: "Birthday messages | See all ideas",
  description: "Useful birthday messages with enough context to choose the right wording. See all ideas on SayTwist.",
  headline: "Birthday messages that feel personal",
  subheadline: "Choose a warm, funny, or thoughtful message for the moment.",
  cta: "See all ideas",
  topic: "Birthdays",
  listItems: ["Warm and thoughtful", "Funny without being mean", "Short and easy to send"],
};

describe("Phase 10 Creative Lab contracts", () => {
  it("registers the control and four deterministic static archetypes", () => {
    expect(DETERMINISTIC_ARCHETYPES).toEqual([
      GrowthCreativeArchetype.V1_CONTROL,
      GrowthCreativeArchetype.TYPOGRAPHY_LED,
      GrowthCreativeArchetype.EDITORIAL_LIST,
      GrowthCreativeArchetype.CONVERSATION_CHAT,
      GrowthCreativeArchetype.MINIMAL_STATEMENT,
    ]);
    expect(getCreativeRendererDefinition(GrowthCreativeArchetype.V1_CONTROL)).toMatchObject({ rendererKey: "v1-control", templateId: "translator-share-control-v1" });
    expect(() => getCreativeRendererDefinition(GrowthCreativeArchetype.BEFORE_AFTER)).toThrow("no Phase 10 deterministic renderer");
  });

  it("renders reproducible bounded 1000x1500 static PNGs", async () => {
    const first = await renderDeterministicCreative(GrowthCreativeArchetype.EDITORIAL_LIST, copy);
    const second = await renderDeterministicCreative(GrowthCreativeArchetype.EDITORIAL_LIST, copy);
    expect(createHash("sha256").update(first).digest("hex")).toBe(createHash("sha256").update(second).digest("hex"));
    expect(readPngDimensions(first)).toEqual({ width: 1000, height: 1500 });
  });

  it("accepts only controlled identifiers and bounded experiment definitions", () => {
    expect(creativeGenerationJobPayloadSchema.safeParse({ targetKind: GrowthCreativeDestinationKind.TRANSLATOR, targetId: "translator_1", archetype: GrowthCreativeArchetype.TYPOGRAPHY_LED, creativeModelVersion: "creative_lab_v1" }).success).toBe(true);
    expect(creativeGenerationJobPayloadSchema.safeParse({ targetKind: GrowthCreativeDestinationKind.TRANSLATOR, targetId: "translator_1", archetype: GrowthCreativeArchetype.BEFORE_AFTER, creativeModelVersion: "creative_lab_v1" }).success).toBe(false);
    expect(creativeGenerationJobPayloadSchema.safeParse({ targetKind: GrowthCreativeDestinationKind.TRANSLATOR, targetId: "../secret", archetype: GrowthCreativeArchetype.TYPOGRAPHY_LED, creativeModelVersion: "creative_lab_v1", rawHtml: "<script>" }).success).toBe(false);
    const experiment = { hypothesis: "Typography improves outbound clicks.", dimension: "ARCHETYPE", variants: [{ key: "a", label: "A", value: "TYPOGRAPHY_LED" }, { key: "b", label: "B", value: "EDITORIAL_LIST" }], primaryKpi: "OUTBOUND_CLICKS", guardrails: { minimumImpressions: 1000, minimumOutboundClicks: 20, maximumDays: 30 }, attributionModelVersion: "pinterest_organic_v1", scoringModelVersion: "opportunity_scoring_v1", experimentModelVersion: "creative_experiment_v1" };
    expect(createExperimentSchema.safeParse(experiment).success).toBe(true);
    expect(createExperimentSchema.safeParse({ ...experiment, variants: [...experiment.variants, ...experiment.variants, ...experiment.variants] }).success).toBe(false);
  });

  it("classifies exact, cross-account, near, related, and distinct candidates deterministically", () => {
    const history = [{ id: "one", title: "Birthday messages for close friends", contentHash: "a".repeat(64), destinationPath: "/ideas/birthday", accountId: "account-a", archetype: "TYPOGRAPHY_LED", templateId: "typography-led-v1" }];
    expect(classifyCreativeSimilarity({ ...history[0], contentHash: history[0].contentHash, accountId: "account-b" }, history)).toMatchObject({ classification: GrowthCreativeSimilarityClassification.EXACT_DUPLICATE, flags: { crossAccount: true } });
    expect(classifyCreativeSimilarity({ ...history[0], contentHash: "b".repeat(64), title: "Birthday messages for your close friends" }, history).classification).toBe(GrowthCreativeSimilarityClassification.NEAR_DUPLICATE);
    expect(classifyCreativeSimilarity({ ...history[0], contentHash: "c".repeat(64), title: "A fresh celebration guide" }, history).classification).toBe(GrowthCreativeSimilarityClassification.RELATED_DISTINCT);
    expect(classifyCreativeSimilarity({ ...history[0], contentHash: "d".repeat(64), destinationPath: "/ideas/other", title: "Conversation starters for class" }, history).classification).toBe(GrowthCreativeSimilarityClassification.DISTINCT);
  });

  it("keeps AI disabled by default and enforces one image unit per job", () => {
    const disabled = createCreativeAiImageBudget(0);
    expect(() => disabled.consume()).toThrow("limit reached");
    const one = createCreativeAiImageBudget(100);
    expect(one.limit).toBe(1);
    expect(one.consume()).toBe(1);
    expect(() => one.consume()).toThrow("limit reached");
  });

  it("rejects malicious asset paths and exposes no Phase 11 status", () => {
    expect(resolveCreativeAssetFile("../secret.png")).toBeNull();
    expect(resolveCreativeAssetFile("creative-not-a-hash.png")).toBeNull();
    expect(Object.values(GrowthPinCandidateStatus)).not.toEqual(expect.arrayContaining(["APPROVED", "QUEUED", "PUBLISHED"]));
    expect(STATIC_RENDERER_DEFINITIONS).not.toHaveProperty(GrowthCreativeArchetype.SCENE_BASED);
  });
});
