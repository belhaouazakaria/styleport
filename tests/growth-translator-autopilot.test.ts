import { describe, expect, it } from "vitest";
import {
  GrowthDecisionType,
  GrowthOpportunityEvidenceQuality,
  GrowthOpportunityStatus,
  GrowthOpportunityType,
} from "@prisma/client";

import { resolveCategory } from "@/lib/growth/translator/categories";
import { classifyTranslatorDuplicate } from "@/lib/growth/translator/dedupe";
import { planTranslatorAction } from "@/lib/growth/translator/planner";
import { validateTranslatorQuality } from "@/lib/growth/translator/quality";
import { needsShareImageRefresh } from "@/lib/growth/translator/service";
import {
  canonicalSnapshotJson,
  checksumTranslatorSnapshot,
  snapshotToTranslatorInput,
  translatorSnapshotSchema,
  type TranslatorSnapshot,
} from "@/lib/growth/translator/snapshot";
import type { TranslatorUpsertInput } from "@/lib/types";

const baseOpportunity = {
  type: GrowthOpportunityType.FILL_INVENTORY_GAP,
  status: GrowthOpportunityStatus.OPEN,
  score: 90,
  confidence: 92,
  evidenceQuality: GrowthOpportunityEvidenceQuality.KNOWN,
  clusterName: "gen-z-flirting",
  mappedTranslatorIds: [] as string[],
  distinctDestinationCount: 3,
  representativeEvidenceCount: 3,
};

function input(): TranslatorUpsertInput {
  return {
    name: "Gen Z Flirting Translator", slug: "gen-z-flirting", title: "Gen Z Flirting Translator", subtitle: "Rewrite messages with playful Gen Z flirting", shortDescription: "Rewrite everyday text into playful Gen Z flirting while preserving the original meaning and intent.",
    sourceLabel: "Original text", targetLabel: "Flirty rewrite", iconName: "", promptSystem: "Transform text into a distinct Gen Z flirting style while preserving meaning and facts.", promptInstructions: "Rewrite the text playfully. Preserve meaning, factual claims, and intent. Never invent details.", seoTitle: "Gen Z Flirting Translator", seoDescription: "Rewrite messages into playful Gen Z flirting without changing their meaning.", modelOverride: "",
    isActive: false, isFeatured: false, showModeSelector: true, showSwap: true, showExamples: true, sortOrder: 50,
    primaryCategoryId: "cat-funny", categoryIds: ["cat-funny"],
    modes: [{ key: "classic", label: "Classic", description: "Playful", instruction: "Use a playful and clear flirting tone.", sortOrder: 1 }],
    examples: [{ label: "Starter", value: "I would like to see you again.", sortOrder: 1 }],
    editorial: {
      about: "A focused translator for playful Gen Z flirting that keeps the original intent clear.",
      whatItDoes: "It rewrites messages with modern, witty flirting language while preserving meaning.",
      differenceDescription: "It focuses on conversational flirting instead of generic slang replacement.",
      lists: [
        { kind: "BEST_USE", content: "Lighthearted dating messages", sortOrder: 1 },
        { kind: "HOW_TO_USE", content: "Paste a message and choose a mode", sortOrder: 2 },
        { kind: "TIP", content: "Keep personal details accurate", sortOrder: 3 },
      ],
      examples: [{ contextTitle: "Date", originalText: "I had fun tonight.", transformedText: "Tonight was actually such a vibe.", sortOrder: 1 }],
      faq: [{ question: "Does it preserve meaning?", answer: "Yes. It changes the style while retaining facts and intent.", sortOrder: 1 }],
    },
  };
}

function snapshot(): TranslatorSnapshot {
  return translatorSnapshotSchema.parse({
    schemaVersion: "translator_snapshot_v1",
    ...input(),
    iconName: null,
    seoTitle: input().seoTitle,
    seoDescription: input().seoDescription,
    primaryCategoryId: "cat-funny",
    categories: [{ id: "cat-funny", name: "Funny", slug: "funny", sortOrder: 1 }],
    modes: input().modes.map((item) => ({ ...item, description: item.description || null })),
    editorial: {
      about: input().editorial?.about,
      whatItDoes: input().editorial?.whatItDoes,
      differenceDescription: input().editorial?.differenceDescription,
      lists: input().editorial?.lists,
      examples: input().editorial?.examples?.map((item) => ({ ...item, contextTitle: item.contextTitle || null })),
      faq: input().editorial?.faq,
    },
  });
}

describe("Translator Autopilot planner", () => {
  it("plans CREATE only for strong gap/rising evidence", () => {
    expect(planTranslatorAction(baseOpportunity).type).toBe(GrowthDecisionType.CREATE_TRANSLATOR);
    expect(planTranslatorAction({ ...baseOpportunity, type: GrowthOpportunityType.EXPLORE_RISING_TOPIC }).type).toBe(GrowthDecisionType.CREATE_TRANSLATOR);
  });

  it("plans IMPROVE for a deterministically mapped strong opportunity", () => {
    const result = planTranslatorAction({ ...baseOpportunity, type: GrowthOpportunityType.AMPLIFY_WINNER, mappedTranslatorIds: ["translator-1"] });
    expect(result).toMatchObject({ type: GrowthDecisionType.IMPROVE_TRANSLATOR, targetTranslatorId: "translator-1" });
  });

  it("waits for stale, fatigue without target, ambiguous targets, and generic evidence", () => {
    expect(planTranslatorAction({ ...baseOpportunity, evidenceQuality: GrowthOpportunityEvidenceQuality.STALE }).type).toBe(GrowthDecisionType.WAIT_FOR_MORE_DATA);
    expect(planTranslatorAction({ ...baseOpportunity, type: GrowthOpportunityType.INVESTIGATE_FATIGUE }).type).toBe(GrowthDecisionType.WAIT_FOR_MORE_DATA);
    expect(planTranslatorAction({ ...baseOpportunity, mappedTranslatorIds: ["a", "b"] }).type).toBe(GrowthDecisionType.WAIT_FOR_MORE_DATA);
    expect(planTranslatorAction({ ...baseOpportunity, clusterName: "roleplay", representativeEvidenceCount: 1 }).type).toBe(GrowthDecisionType.WAIT_FOR_MORE_DATA);
  });

  it("does not create from AMPLIFY_WINNER and returns NO_ACTION for weak evidence", () => {
    expect(planTranslatorAction({ ...baseOpportunity, type: GrowthOpportunityType.AMPLIFY_WINNER }).type).toBe(GrowthDecisionType.NO_ACTION);
    expect(planTranslatorAction({ ...baseOpportunity, score: 30, confidence: 40 }).type).toBe(GrowthDecisionType.NO_ACTION);
  });
});

describe("Translator Autopilot dedupe", () => {
  const candidates = [
    { id: "1", name: "Gen Z Flirting Translator", slug: "gen-z-flirting", categorySlugs: ["funny"], promptPurpose: "playful Gen Z flirting", archivedAt: null },
    { id: "2", name: "Shakespeare Translator", slug: "shakespeare", categorySlugs: ["historical"], promptPurpose: "Elizabethan prose", archivedAt: null },
  ];
  it("detects exact and near duplicates beyond exact slug", () => {
    expect(classifyTranslatorDuplicate({ ...candidates[0], slug: "gen-z-flirting" }, candidates).classification).toBe("EXACT_DUPLICATE");
    expect(classifyTranslatorDuplicate({ name: "Gen Z Flirty Messages", slug: "gen-z-flirty-messages", categorySlugs: ["funny"], promptPurpose: "playful Gen Z flirting", archivedAt: null }, candidates).classification).toBe("NEAR_DUPLICATE");
  });
  it("distinguishes related and distinct concepts deterministically", () => {
    const proposed = { name: "Gen Z Apology", slug: "gen-z-apology", categorySlugs: ["funny"], promptPurpose: "modern apology rewrite", archivedAt: null };
    const forward = classifyTranslatorDuplicate(proposed, candidates);
    const reverse = classifyTranslatorDuplicate(proposed, [...candidates].reverse());
    expect(forward).toEqual(reverse);
    expect(["RELATED_DISTINCT", "DISTINCT"]).toContain(forward.classification);
  });
  it("blocks archived equivalents as duplicate history", () => {
    const archived = [{ ...candidates[0], archivedAt: new Date() }];
    const result = classifyTranslatorDuplicate({ ...candidates[0], archivedAt: null }, archived);
    expect(result.classification).toBe("EXACT_DUPLICATE");
    expect(result.match?.archivedAt).toBeInstanceOf(Date);
  });
});

describe("Translator Autopilot category safety", () => {
  const categories = [
    { id: "1", name: "Funny", slug: "funny", isActive: true, archivedAt: null },
    { id: "2", name: "Old", slug: "old", isActive: false, archivedAt: new Date() },
  ];
  it("resolves exact active names/slugs and deterministic aliases", () => {
    expect(resolveCategory("Funny", categories)).toMatchObject({ status: "RESOLVED", category: { id: "1" } });
    expect(resolveCategory("humor", categories)).toMatchObject({ status: "RESOLVED", category: { id: "1" } });
  });
  it("rejects inactive, unknown, and ambiguous categories", () => {
    expect(resolveCategory("old", categories).status).toBe("INACTIVE");
    expect(resolveCategory("missing", categories).status).toBe("UNKNOWN");
    expect(resolveCategory("funny", [...categories, { id: "3", name: "Funny", slug: "funny-alt", isActive: true, archivedAt: null }]).status).toBe("AMBIGUOUS");
  });
});

describe("Translator quality and versioning", () => {
  it("accepts a complete draft and reports material changes", () => {
    const result = validateTranslatorQuality(input(), { activeCategoryIds: new Set(["cat-funny"]) });
    expect(result.valid).toBe(true);
    expect(result.changedFields.length).toBeGreaterThan(0);
  });
  it.each([
    ["duplicate mode", () => ({ ...input(), modes: [...input().modes, input().modes[0]] }), "DUPLICATE_MODE"],
    ["duplicate example", () => ({ ...input(), examples: [...input().examples, input().examples[0]] }), "DUPLICATE_EXAMPLE"],
    ["placeholder", () => ({ ...input(), subtitle: "TODO placeholder" }), "PLACEHOLDER_TEXT"],
    ["generic clone", () => ({ ...input(), name: "AI Translator", slug: "ai-translator" }), "GENERIC_CLONE"],
    ["em dash", () => ({ ...input(), subtitle: "Rewrite text — clearly" }), "EM_DASH"],
    ["unknown category", () => input(), "CATEGORY_INVALID"],
  ])("rejects %s", (_name, make, code) => {
    const active = code === "CATEGORY_INVALID" ? new Set<string>() : new Set(["cat-funny"]);
    expect(validateTranslatorQuality(make(), { activeCategoryIds: active }).diagnostics.map((item) => item.code)).toContain(code);
  });
  it("rejects a non-material improvement", () => {
    expect(validateTranslatorQuality(input(), { activeCategoryIds: new Set(["cat-funny"]), previous: input() }).diagnostics.map((item) => item.code)).toContain("NO_MATERIAL_CHANGE");
  });
  it("canonicalizes nested order and produces a deterministic checksum", () => {
    const first = snapshot();
    const second = translatorSnapshotSchema.parse({
      ...first,
      categories: [...first.categories].reverse(),
      modes: [...first.modes].reverse(),
      examples: [...first.examples].reverse(),
      editorial: {
        ...first.editorial,
        lists: [...first.editorial.lists].reverse(),
        examples: [...first.editorial.examples].reverse(),
        faq: [...first.editorial.faq].reverse(),
      },
    });
    expect(canonicalSnapshotJson(first)).toBe(canonicalSnapshotJson(second));
    expect(checksumTranslatorSnapshot(first)).toMatch(/^[a-f0-9]{64}$/);
    expect(checksumTranslatorSnapshot(first)).toBe(checksumTranslatorSnapshot(second));
  });
  it("restores every managed nested field through the trusted snapshot", () => {
    const restored = snapshotToTranslatorInput(snapshot());
    expect(restored.slug).toBe("gen-z-flirting");
    expect(restored.categoryIds).toEqual(["cat-funny"]);
    expect(restored.modes[0].key).toBe("classic");
    expect(restored.editorial?.faq?.[0].question).toBe("Does it preserve meaning?");
  });

  it("excludes operational state and detects every managed concurrency boundary", () => {
    const base = snapshot();
    expect(base).not.toHaveProperty("isActive");
    expect(base).not.toHaveProperty("isFeatured");
    expect(base).not.toHaveProperty("sortOrder");
    expect(base).not.toHaveProperty("modelOverride");
    expect(base).not.toHaveProperty("archivedAt");
    expect(base).not.toHaveProperty("shareImagePath");
    const checksum = checksumTranslatorSnapshot(base);
    expect(checksumTranslatorSnapshot({ ...base, subtitle: `${base.subtitle} changed` })).not.toBe(checksum);
    expect(checksumTranslatorSnapshot({ ...base, modes: base.modes.map((item) => ({ ...item, instruction: `${item.instruction} changed` })) })).not.toBe(checksum);
    expect(checksumTranslatorSnapshot({ ...base, editorial: { ...base.editorial, about: `${base.editorial.about} changed` } })).not.toBe(checksum);
    expect(checksumTranslatorSnapshot({ ...base, categories: base.categories.map((item) => ({ ...item, id: `${item.id}-changed` })), primaryCategoryId: "cat-funny-changed" })).not.toBe(checksum);
  });

  it("refreshes share images only when share-driving content changes", () => {
    const base = snapshot();
    expect(needsShareImageRefresh(null, base)).toBe(true);
    expect(needsShareImageRefresh(base, { ...base, title: "Changed title only" })).toBe(false);
    expect(needsShareImageRefresh(base, { ...base, subtitle: "Changed subtitle" })).toBe(true);
  });
});
