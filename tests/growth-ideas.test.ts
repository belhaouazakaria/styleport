import { GrowthDecisionType, GrowthOpportunityEvidenceQuality, GrowthOpportunityStatus, GrowthOpportunityType } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { checksumIdeaCandidate } from "@/lib/growth/ideas/checksum";
import { generatedIdeaCandidateSchema, ideaBlockSchema, type ResolvedIdeaCandidate } from "@/lib/growth/ideas/contracts";
import { classifyIdeaDuplicate } from "@/lib/growth/ideas/dedupe";
import { MAX_IDEA_DEDUPE_CANDIDATES } from "@/lib/growth/ideas/constants";
import { planIdeaAction } from "@/lib/growth/ideas/planner";
import { validateIdeaQuality } from "@/lib/growth/ideas/quality";

function candidate(overrides: Partial<ResolvedIdeaCandidate> = {}): ResolvedIdeaCandidate {
  return {
    title: "15 Funny Ways to Say Happy Birthday",
    slug: "15-funny-ways-to-say-happy-birthday",
    categoryId: "birthdays",
    excerpt: "Fifteen playful birthday messages with enough context to choose one that fits the person and the moment.",
    seoTitle: "15 Funny Ways to Say Happy Birthday",
    seoDescription: "Find fifteen funny birthday messages with practical context, from warm teasing to playful one-liners for friends and family.",
    blocks: [
      { type: "INTRO", text: "A funny birthday message works best when it sounds like you and still feels kind to the person receiving it." },
      { type: "HEADING", level: 2, text: "Funny birthday messages" },
      { type: "IDEA_LIST", items: Array.from({ length: 15 }, (_, index) => ({ text: `Birthday message number ${index + 1} with a specific playful angle`, context: `Use this when situation ${index + 1} fits the recipient.` })) },
      { type: "CALLOUT", heading: "Keep the joke kind", text: "Choose a line that matches your relationship and avoids sensitive subjects." },
      { type: "TRANSLATOR_CTA", translatorId: "translator-1", heading: "Make it funnier", body: "Use the Funny Translator when you have a message and want a playful rewrite.", buttonLabel: "Try the Funny Translator" },
    ],
    ...overrides,
  };
}

describe("Growth Ideas block contracts", () => {
  it("accepts strict supported blocks and rejects unknown types and HTML fields", () => {
    expect(ideaBlockSchema.safeParse({ type: "PARAGRAPH", text: "Useful guidance." }).success).toBe(true);
    expect(ideaBlockSchema.safeParse({ type: "RAW_HTML", html: "<b>bad</b>" }).success).toBe(false);
    expect(ideaBlockSchema.safeParse({ type: "PARAGRAPH", text: "Useful", style: "color:red" }).success).toBe(false);
  });

  it("bounds block and item counts at the schema boundary", () => {
    const base = candidate();
    const generated = { title: base.title, slug: base.slug, categorySuggestion: "birthdays", excerpt: base.excerpt, seoTitle: base.seoTitle, seoDescription: base.seoDescription, blocks: Array.from({ length: 33 }, () => ({ type: "PARAGRAPH", text: "Useful sentence." })) };
    expect(generatedIdeaCandidateSchema.safeParse(generated).success).toBe(false);
    expect(ideaBlockSchema.safeParse({ type: "TIP_LIST", items: Array.from({ length: 41 }, (_, index) => `Tip ${index}`) }).success).toBe(false);
  });
});

describe("Growth Ideas quality", () => {
  it("accepts a realistic page with exactly 15 promised items", () => {
    const value = candidate();
    expect(validateIdeaQuality(value, { activeTranslatorIds: new Set(["translator-1"]), checksum: checksumIdeaCandidate(value) })).toMatchObject({ valid: true, meaningfulItemCount: 15 });
  });

  it.each([
    ["numeric mismatch", { title: "14 Funny Ways to Say Happy Birthday" }, "NUMERIC_TITLE_MISMATCH"],
    ["em dash", { excerpt: "Useful ideas — with context for every message and situation." }, "EM_DASH"],
    ["raw html", { excerpt: "A useful <script>alert(1)</script> guide with practical birthday wording." }, "HTML_NOT_ALLOWED"],
    ["placeholder", { excerpt: "TODO placeholder copy for this birthday article and its eventual useful examples." }, "PLACEHOLDER_TEXT"],
    ["invalid translator", {}, "TRANSLATOR_REFERENCE_INVALID"],
  ])("rejects %s", (_name, overrides, code) => {
    const value = candidate(overrides as Partial<ResolvedIdeaCandidate>);
    const result = validateIdeaQuality(value, { activeTranslatorIds: code === "TRANSLATOR_REFERENCE_INVALID" ? new Set() : new Set(["translator-1"]), checksum: checksumIdeaCandidate(value) });
    expect(result.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ code })]));
  });

  it("rejects thin, repeated, CTA-heavy, and oversized content", () => {
    const thin = candidate({ title: "Birthday Message Guide", blocks: [{ type: "INTRO", text: "Short intro." }, { type: "PARAGRAPH", text: "Short guidance." }, { type: "CALLOUT", text: "Short note." }] });
    expect(validateIdeaQuality(thin).diagnostics.map((item) => item.code)).toContain("THIN_CONTENT");
    const repeated = candidate({ blocks: [{ type: "INTRO", text: "Useful opening for a birthday message." }, { type: "IDEA_LIST", items: Array.from({ length: 15 }, () => ({ text: "Same birthday line" })) }, { type: "PARAGRAPH", text: "Choose the line that fits your friend." }] });
    expect(validateIdeaQuality(repeated).diagnostics.map((item) => item.code)).toContain("DUPLICATE_ITEMS");
    const repeatedParagraph = candidate({ title: "Birthday Message Guide", blocks: [{ type: "INTRO", text: "Choose a birthday line that fits your friend and your shared sense of humor." }, { type: "PARAGRAPH", text: "Use a warm birthday message with one specific detail from your friendship." }, { type: "PARAGRAPH", text: "Use a warm birthday message with one specific detail from your friendship." }] });
    expect(validateIdeaQuality(repeatedParagraph).diagnostics.map((item) => item.code)).toContain("DUPLICATE_PARAGRAPHS");
    const cta = candidate().blocks.at(-1)!;
    const ctaHeavy = candidate({ title: "Birthday Message Guide", blocks: [{ type: "INTRO", text: "Useful opening with practical birthday context." }, cta, cta] });
    expect(validateIdeaQuality(ctaHeavy, { activeTranslatorIds: new Set(["translator-1"]) }).diagnostics.map((item) => item.code)).toContain("CTA_HEAVY");
    const oversized = candidate({ title: "Birthday Message Guide", blocks: Array.from({ length: 10 }, (_, block) => ({ type: "IDEA_LIST" as const, items: Array.from({ length: 40 }, (_, item) => ({ text: `${block}-${item} ${"useful birthday wording ".repeat(24)}` })) })) });
    expect(validateIdeaQuality(oversized).diagnostics.map((item) => item.code)).toContain("PAYLOAD_TOO_LARGE");
  });

  it("rejects keyword stuffing, unsupported claims, reserved slugs, broken headings, and unrelated Translator CTAs", () => {
    const stuffed = candidate({ title: "Birthday Message Guide", blocks: [{ type: "INTRO", text: "birthday ".repeat(40) }, ...candidate().blocks.slice(1)] });
    expect(validateIdeaQuality(stuffed, { activeTranslatorIds: new Set(["translator-1"]) }).diagnostics.map((item) => item.code)).toContain("KEYWORD_STUFFING");
    expect(validateIdeaQuality(candidate({ excerpt: "These messages are scientifically proven to guarantee a perfect birthday reaction." })).diagnostics.map((item) => item.code)).toContain("UNSUPPORTED_CLAIM");
    expect(validateIdeaQuality(candidate({ slug: "admin" })).diagnostics.map((item) => item.code)).toContain("SLUG_RESERVED");
    expect(validateIdeaQuality(candidate({ blocks: [{ type: "INTRO", text: "Useful birthday guidance with concrete examples." }, { type: "HEADING", level: 3, text: "A skipped section" }, ...candidate().blocks.slice(2)] })).diagnostics.map((item) => item.code)).toContain("HEADING_HIERARCHY");
    expect(validateIdeaQuality(candidate(), { activeTranslatorIds: new Set(["translator-1"]), translatorContextById: new Map([["translator-1", "Formal legal contract translator"]]) }).diagnostics.map((item) => item.code)).toContain("TRANSLATOR_CONTEXT_MISMATCH");
  });
});

describe("Growth Ideas planner", () => {
  const base = { type: GrowthOpportunityType.FILL_INVENTORY_GAP, status: GrowthOpportunityStatus.OPEN, score: 90, confidence: 90, evidenceQuality: GrowthOpportunityEvidenceQuality.KNOWN, clusterName: "birthday-messages", representativeEvidenceCount: 3, mappedIdeaIds: [] as string[], obviousCoverage: "NONE" as const };
  it("plans create, improve, wait, and no action conservatively", () => {
    expect(planIdeaAction(base).type).toBe(GrowthDecisionType.CREATE_IDEA);
    expect(planIdeaAction({ ...base, mappedIdeaIds: ["idea-1"] })).toMatchObject({ type: GrowthDecisionType.IMPROVE_IDEA, targetIdeaId: "idea-1" });
    expect(planIdeaAction({ ...base, type: GrowthOpportunityType.INVESTIGATE_FATIGUE }).type).toBe(GrowthDecisionType.WAIT_FOR_MORE_DATA);
    expect(planIdeaAction({ ...base, score: 20 }).type).toBe(GrowthDecisionType.NO_ACTION);
  });
  it("does not turn a generic winner label into an article", () => {
    expect(planIdeaAction({ ...base, type: GrowthOpportunityType.AMPLIFY_WINNER, clusterName: "roleplay", representativeEvidenceCount: 2 }).type).toBe(GrowthDecisionType.WAIT_FOR_MORE_DATA);
  });
});

describe("Growth Ideas dedupe and checksum", () => {
  const existing = { id: "idea-1", title: "15 Funny Ways to Say Happy Birthday", slug: "15-funny-ways-to-say-happy-birthday", categoryId: "birthdays", clusterId: "birthday", itemFingerprints: ["Happy birthday, legend"], archivedAt: null };
  it("classifies exact, near, related, distinct, and insufficient inputs", () => {
    expect(classifyIdeaDuplicate({ ...existing, title: existing.title, slug: existing.slug }, [existing]).classification).toBe("EXACT_DUPLICATE");
    expect(classifyIdeaDuplicate({ ...existing, title: "Funny Happy Birthday Messages", slug: "funny-happy-birthday-messages" }, [existing]).classification).toBe("NEAR_DUPLICATE");
    expect(classifyIdeaDuplicate({ ...existing, title: "Warm Birthday Wishes for Coworkers", slug: "warm-birthday-wishes-for-coworkers", itemFingerprints: ["A thoughtful professional wish"] }, [existing]).classification).toBe("RELATED_DISTINCT");
    expect(classifyIdeaDuplicate({ ...existing, title: "Conversation Starters for a New Class", slug: "conversation-starters-new-class", categoryId: "conversation", clusterId: "school", itemFingerprints: [] }, [existing]).classification).toBe("DISTINCT");
    expect(classifyIdeaDuplicate({ ...existing, title: "Ideas", slug: "ideas", itemFingerprints: [] }, []).classification).toBe("INSUFFICIENT_DATA");
    expect(classifyIdeaDuplicate({ ...existing, title: "New birthday angle", slug: "new-birthday-angle" }, Array.from({ length: MAX_IDEA_DEDUPE_CANDIDATES + 1 }, (_, index) => ({ ...existing, id: `idea-${index}` })))).toMatchObject({ classification: "INSUFFICIENT_DATA", capExceeded: true });
  });
  it("is deterministic and changes for semantic content edits", () => {
    const original = candidate();
    expect(checksumIdeaCandidate(original)).toBe(checksumIdeaCandidate(structuredClone(original)));
    expect(checksumIdeaCandidate(original)).not.toBe(checksumIdeaCandidate({ ...original, excerpt: `${original.excerpt} Updated.` }));
    expect(checksumIdeaCandidate(original)).not.toBe(checksumIdeaCandidate({ ...original, blocks: [...original.blocks].reverse() }));
  });
});
