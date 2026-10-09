import { createHash } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import {
  GrowthCreativeArchetype,
  GrowthCreativeDestinationKind,
  GrowthCreativeSimilarityClassification,
  GrowthPinCandidateStatus,
} from "@prisma/client";
import { describe, expect, it } from "vitest";

import { createCreativeAiImageBudget } from "@/lib/growth/creative/ai-image-provider";
import { creativeTemplateIdForVariation, creativeVariationFromTemplateId, nextCreativeVariation } from "@/lib/growth/creative/candidates";
import { GET as getCreativeAsset } from "@/app/generated/growth-creatives/[filename]/route";
import { CREATIVE_RENDERER_VERSION, DETERMINISTIC_ARCHETYPES, STATIC_RENDERER_DEFINITIONS } from "@/lib/growth/creative/constants";
import { creativeGenerationJobPayloadSchema, creativeGenerationRequestSchema, createExperimentSchema } from "@/lib/growth/creative/contracts";
import { buildCreativeSvg, capCreativeTextLines, CREATIVE_TEXT_LINE_LIMITS, fitCreativeText, getCreativeRendererDefinition, renderDeterministicCreative } from "@/lib/growth/creative/renderer";
import { buildExactCreativeSimilarity, classifyCreativeSimilarity } from "@/lib/growth/creative/similarity";
import { cleanupCreativeAssetAfterFailure, persistCreativeAssetFile, readPngDimensions, releaseCreativeAssetLease, resolveCreativeAssetFile } from "@/lib/growth/creative/storage";

const copy = {
  title: "Birthday messages | See all ideas",
  description: "Useful birthday messages with enough context to choose the right wording. See all ideas on SayTwist.",
  headline: "Birthday messages that feel personal",
  subheadline: "Choose a warm, funny, or thoughtful message for the moment.",
  cta: "See all ideas",
  topic: "Birthdays",
  listItems: ["Warm and thoughtful", "Funny without being mean", "Short and easy to send"],
  exampleInput: "Can we talk about this later?",
  exampleOutput: "Let's come back to this when we can give it our full attention.",
};

describe("Phase 10 Creative Lab contracts", () => {
  it("registers the control and focused deterministic concept set", () => {
    expect(DETERMINISTIC_ARCHETYPES).toEqual([
      GrowthCreativeArchetype.V1_CONTROL,
      GrowthCreativeArchetype.MINIMAL_STATEMENT,
      GrowthCreativeArchetype.BEFORE_AFTER,
    ]);
    expect(getCreativeRendererDefinition(GrowthCreativeArchetype.V1_CONTROL)).toMatchObject({ rendererKey: "v1-control", templateId: "translator-share-control-v1" });
    expect(getCreativeRendererDefinition(GrowthCreativeArchetype.BEFORE_AFTER)).toMatchObject({ templateId: "before-after-showcase-v1", visualTreatment: "transformation-cards" });
  });

  it("renders reproducible bounded 1000x1500 static PNGs", async () => {
    const first = await renderDeterministicCreative(GrowthCreativeArchetype.BEFORE_AFTER, copy);
    const second = await renderDeterministicCreative(GrowthCreativeArchetype.BEFORE_AFTER, copy);
    expect(createHash("sha256").update(first).digest("hex")).toBe(createHash("sha256").update(second).digest("hex"));
    expect(readPngDimensions(first)).toEqual({ width: 1000, height: 1500 });
  });

  it("uses the current SayTwist palette and versioned static renderer", () => {
    expect(CREATIVE_RENDERER_VERSION).toBe("creative_static_v4");
    for (const archetype of [GrowthCreativeArchetype.MINIMAL_STATEMENT, GrowthCreativeArchetype.BEFORE_AFTER]) {
      const svg = buildCreativeSvg(archetype, copy).toString("utf8");
      expect(svg).toContain("#14B8A6");
      expect(svg).toContain("#FF7A59");
      expect(svg).toContain("#0F172A");
      expect(svg).toContain("#FFF9F4");
      expect(svg).not.toContain("#f1e8ff");
      expect(svg).not.toContain("#7048d8");
      expect(svg).toContain('data-brand="text-wordmark"');
      expect(svg).toContain("<tspan fill=\"#0F172A\">Say</tspan><tspan fill=\"#14B8A6\">Twist</tspan>");
      expect(svg).not.toContain('data-brand="logo-icon"');
      expect(svg).toContain('clip-path="url(#safe-canvas)"');
      expect(svg).toContain('data-element="footer"');
    }
  });

  it("renders short, medium, and long copy safely across every deterministic archetype", async () => {
    const copyLengths = [
      { ...copy, headline: "Say it warmly", subheadline: "A softer way to share it.", cta: "Try it" },
      copy,
      { ...copy, headline: "Cold Hearted Cunning And Manipulative Translator", subheadline: "Turn a complicated thought into a polished message that still sounds unmistakably like you.", cta: "Try it with your own text" },
    ];
    for (const archetype of [GrowthCreativeArchetype.MINIMAL_STATEMENT, GrowthCreativeArchetype.BEFORE_AFTER]) {
      for (const sample of copyLengths) {
        const svg = buildCreativeSvg(archetype, sample).toString("utf8");
        const png = await renderDeterministicCreative(archetype, sample);
        expect(svg).toContain(`data-layout="${archetype === GrowthCreativeArchetype.BEFORE_AFTER ? "before-after-showcase" : "minimal-poster"}"`);
        expect(readPngDimensions(png)).toEqual({ width: 1000, height: 1500 });
      }
    }
  });

  it("shows meaningful before-and-after content and persisted controlled variation", async () => {
    const showcase = buildCreativeSvg(GrowthCreativeArchetype.BEFORE_AFTER, copy, 2).toString("utf8");
    expect(showcase).toContain("BEFORE");
    expect(showcase).toContain("AFTER");
    expect(showcase).toContain("Can we talk about this later?");
    expect(showcase).toContain("give it our full attention");
    expect(showcase).not.toContain("undefined");

    const variants = new Set([0, 1, 2].map((variation) => buildCreativeSvg(GrowthCreativeArchetype.MINIMAL_STATEMENT, copy, variation).toString("utf8").match(/data-variant="([0-2])"/)?.[1]));
    expect(variants).toEqual(new Set(["0", "1", "2"]));
    expect(buildCreativeSvg(GrowthCreativeArchetype.MINIMAL_STATEMENT, copy).toString("utf8")).toContain('data-variant="0"');

    const sameJobFirst = await renderDeterministicCreative(GrowthCreativeArchetype.MINIMAL_STATEMENT, copy, 1);
    const sameJobRetry = await renderDeterministicCreative(GrowthCreativeArchetype.MINIMAL_STATEMENT, copy, 1);
    const nextIntentional = await renderDeterministicCreative(GrowthCreativeArchetype.MINIMAL_STATEMENT, copy, 2);
    expect(createHash("sha256").update(sameJobFirst).digest("hex")).toBe(createHash("sha256").update(sameJobRetry).digest("hex"));
    expect(createHash("sha256").update(nextIntentional).digest("hex")).not.toBe(createHash("sha256").update(sameJobFirst).digest("hex"));
    const firstVariation = nextCreativeVariation(null);
    const firstTemplate = creativeTemplateIdForVariation("minimal-poster-v2", firstVariation);
    const secondVariation = nextCreativeVariation(firstTemplate);
    const secondTemplate = creativeTemplateIdForVariation("minimal-poster-v2", secondVariation);
    expect([firstVariation, secondVariation, nextCreativeVariation(secondTemplate)]).toEqual([0, 1, 2]);
    expect(nextCreativeVariation("minimal-poster-v2-layout-3")).toBe(0);
    expect(creativeVariationFromTemplateId(creativeTemplateIdForVariation("minimal-poster-v2", 99))).toBe(2);
    expect(creativeVariationFromTemplateId(creativeTemplateIdForVariation("minimal-poster-v2", -99))).toBe(0);
    expect(() => buildCreativeSvg(GrowthCreativeArchetype.BEFORE_AFTER, { ...copy, exampleInput: undefined, exampleOutput: undefined })).toThrow("verified example evidence");
  });

  it("caps maximum schema-valid static copy inside declared deterministic line limits", async () => {
    const maximumCopy = { title: "T".repeat(100), description: "D".repeat(500), headline: "H".repeat(90), subheadline: "S".repeat(180), cta: "C".repeat(50), topic: "P".repeat(160), listItems: Array.from({ length: 5 }, () => "L".repeat(80)), exampleInput: "I".repeat(180), exampleOutput: "O".repeat(180) };
    for (const archetype of [GrowthCreativeArchetype.MINIMAL_STATEMENT, GrowthCreativeArchetype.BEFORE_AFTER]) {
      const first = await renderDeterministicCreative(archetype, maximumCopy);
      const second = await renderDeterministicCreative(archetype, maximumCopy);
      expect(createHash("sha256").update(first).digest("hex")).toBe(createHash("sha256").update(second).digest("hex"));
      expect(readPngDimensions(first)).toEqual({ width: 1000, height: 1500 });
    }
    for (const limit of Object.values(CREATIVE_TEXT_LINE_LIMITS)) {
      const lines = capCreativeTextLines("maximum ".repeat(100), limit.characters, limit.lines);
      expect(lines.length).toBeLessThanOrEqual(limit.lines);
      expect(lines.every((line) => line.length <= limit.characters)).toBe(true);
      expect(lines.at(-1)).toMatch(/…$/);
    }
    const fitted = fitCreativeText("A very long headline ".repeat(20), { maximumCharacters: 18, maximumLines: 4, maximumFontSize: 86, minimumFontSize: 58, availableWidth: 730 });
    expect(fitted.lines).toHaveLength(4);
    expect(fitted.lines.every((line) => line.length <= 18)).toBe(true);
    expect(fitted.lines.at(-1)).toMatch(/…$/);
    expect(fitted.fontSize).toBeGreaterThanOrEqual(58);
    expect(fitted.fontSize).toBeLessThanOrEqual(86);
  });

  it("accepts only controlled identifiers and bounded experiment definitions", () => {
    expect(creativeGenerationJobPayloadSchema.safeParse({ targetKind: GrowthCreativeDestinationKind.TRANSLATOR, targetId: "translator_1", archetype: GrowthCreativeArchetype.MINIMAL_STATEMENT, creativeModelVersion: "creative_lab_v1" }).success).toBe(true);
    expect(creativeGenerationJobPayloadSchema.safeParse({ targetKind: GrowthCreativeDestinationKind.TRANSLATOR, targetId: "translator_1", archetype: GrowthCreativeArchetype.BEFORE_AFTER, useAiExample: true, creativeModelVersion: "creative_lab_v1" }).success).toBe(true);
    expect(creativeGenerationRequestSchema.safeParse({ targetKind: GrowthCreativeDestinationKind.TRANSLATOR, targetId: "translator_1", archetype: GrowthCreativeArchetype.TYPOGRAPHY_LED, creativeModelVersion: "creative_lab_v1" }).success).toBe(false);
    expect(creativeGenerationRequestSchema.safeParse({ targetKind: GrowthCreativeDestinationKind.IDEA, targetId: "idea_1", archetype: GrowthCreativeArchetype.BEFORE_AFTER, creativeModelVersion: "creative_lab_v1" }).success).toBe(false);
    expect(creativeGenerationRequestSchema.safeParse({ targetKind: GrowthCreativeDestinationKind.TRANSLATOR, targetId: "translator_1", archetype: GrowthCreativeArchetype.MINIMAL_STATEMENT, useAiExample: true, creativeModelVersion: "creative_lab_v1" }).success).toBe(false);
    expect(creativeGenerationRequestSchema.safeParse({ targetKind: GrowthCreativeDestinationKind.TRANSLATOR, targetId: "translator_1", archetype: GrowthCreativeArchetype.MINIMAL_STATEMENT, visualVariation: 2, creativeModelVersion: "creative_lab_v1" }).success).toBe(false);
    expect(creativeGenerationJobPayloadSchema.safeParse({ targetKind: GrowthCreativeDestinationKind.TRANSLATOR, targetId: "translator_1", archetype: GrowthCreativeArchetype.MINIMAL_STATEMENT, visualVariation: 2, creativeModelVersion: "creative_lab_v1" }).success).toBe(true);
    expect(creativeGenerationJobPayloadSchema.safeParse({ targetKind: GrowthCreativeDestinationKind.TRANSLATOR, targetId: "../secret", archetype: GrowthCreativeArchetype.TYPOGRAPHY_LED, creativeModelVersion: "creative_lab_v1", rawHtml: "<script>" }).success).toBe(false);
    const experiment = { hypothesis: "Typography improves outbound clicks.", dimension: "ARCHETYPE", variants: [{ key: "a", label: "A", value: "TYPOGRAPHY_LED" }, { key: "b", label: "B", value: "EDITORIAL_LIST" }], primaryKpi: "OUTBOUND_CLICKS", guardrails: { minimumImpressions: 1000, minimumOutboundClicks: 20, maximumDays: 30 }, attributionModelVersion: "pinterest_organic_v1", scoringModelVersion: "opportunity_scoring_v1", experimentModelVersion: "creative_experiment_v1" };
    expect(createExperimentSchema.safeParse(experiment).success).toBe(true);
    expect(createExperimentSchema.safeParse({ ...experiment, variants: [...experiment.variants, ...experiment.variants, ...experiment.variants] }).success).toBe(false);
  });

  it("classifies exact, cross-account, near, related, and distinct candidates deterministically", () => {
    const history = [{ id: "one", title: "Birthday messages for close friends", contentHash: "a".repeat(64), destinationPath: "/ideas/birthday", topic: "Birthdays", accountId: "account-a", archetype: "TYPOGRAPHY_LED", templateId: "typography-led-v1" }];
    expect(buildExactCreativeSimilarity({ ...history[0], accountId: "account-b" }, history[0], { contentHash: true, assetChecksum: true })).toMatchObject({ classification: GrowthCreativeSimilarityClassification.EXACT_DUPLICATE, flags: { exactContentHash: true, exactAssetChecksum: true, crossAccount: true } });
    expect(classifyCreativeSimilarity({ ...history[0], contentHash: "b".repeat(64), title: "Birthday messages for your close friends" }, history).classification).toBe(GrowthCreativeSimilarityClassification.NEAR_DUPLICATE);
    expect(classifyCreativeSimilarity({ ...history[0], contentHash: "c".repeat(64), title: "A fresh celebration guide" }, history).classification).toBe(GrowthCreativeSimilarityClassification.RELATED_DISTINCT);
    expect(classifyCreativeSimilarity({ ...history[0], contentHash: "d".repeat(64), destinationPath: "/ideas/other", topic: "Classroom", title: "Birthday messages for close friends" }, history).classification).toBe(GrowthCreativeSimilarityClassification.DISTINCT);
  });

  it("publishes identical assets without clobbering and preserves files when references are known or unknown", async () => {
    const bytes = await renderDeterministicCreative(GrowthCreativeArchetype.MINIMAL_STATEMENT, { ...copy, headline: "Concurrent storage hardening" });
    const stored = await Promise.all([persistCreativeAssetFile(bytes), persistCreativeAssetFile(bytes)]);
    expect(stored.filter((item) => item.created)).toHaveLength(1);
    expect(new Set(stored.map((item) => item.filePath)).size).toBe(1);
    const owner = stored.find((item) => item.created)!;
    expect(await cleanupCreativeAssetAfterFailure(owner, async () => { throw new Error("database unavailable"); })).toBe(false);
    expect(await readFile(owner.filePath)).toEqual(bytes);
    expect(await cleanupCreativeAssetAfterFailure(owner, async () => 1)).toBe(false);
    expect(await readFile(owner.filePath)).toEqual(bytes);
    const response = await getCreativeAsset(new Request("https://saytwist.com"), { params: Promise.resolve({ filename: owner.publicPath.split("/").at(-1)! }) });
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow, noarchive");
    expect(response.headers.get("cache-control")).toContain("immutable");
    await Promise.all(stored.map((item) => releaseCreativeAssetLease(item.leasePath)));
    await rm(owner.filePath, { force: true });
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
