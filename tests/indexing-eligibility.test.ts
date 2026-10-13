import { describe, expect, it } from "vitest";

import {
  assessTranslatorIndexingEligibility,
  INDEXING_EXCLUSION_REASON_CODES,
  isCurrentEditorialVersionReviewed,
} from "@/lib/indexing-eligibility";
import type { TranslatorEditorialDraft } from "@/lib/types";

const editorial: TranslatorEditorialDraft = {
  about: "This translator gives practical, translator-specific context for a real communication need and explains the audience clearly.",
  whatItDoes: "It rewrites an ordinary source into a distinct result while preserving the intended meaning.",
  differenceDescription: "It focuses on a specific voice, explains its limitations, and should not be used where literal wording is required.",
  bestUses: ["Friendly customer replies with a clear next step", "Concise captions for an established brand voice", "Warm notes that keep the original facts"],
  howToUse: ["Paste the exact source text you want to transform", "Choose the tone that matches the intended audience", "Review names, facts, and nuance before publishing"],
  tips: ["Include the audience and desired level of formality", "Keep required facts in the source text", "Compare the result with the original intent"],
  examples: [
    { contextTitle: "Support reply", originalText: "We received your request and will reply tomorrow.", transformedText: "Thanks for reaching out. We have your request and will follow up tomorrow." },
    { contextTitle: "Team note", originalText: "Send the draft by Friday so we can review it.", transformedText: "Please share the draft by Friday so the team has time for a thoughtful review." },
    { contextTitle: "Caption", originalText: "Our new collection is available today.", transformedText: "The new collection has arrived and is ready to explore today." },
  ],
  faq: [
    { question: "Does it preserve the meaning of the source?", answer: "It is designed to retain the core meaning, but a person should verify facts and nuance." },
    { question: "Can I use the result without reviewing it?", answer: "No. Review names, claims, tone, and context before sharing any generated result." },
    { question: "When should I avoid this translator?", answer: "Avoid it for legal, medical, or other wording that must remain literal and professionally reviewed." },
  ],
};

describe("translator indexing eligibility", () => {
  it("recognizes review only when it matches the current published editorial", () => {
    expect(isCurrentEditorialVersionReviewed(editorial, editorial)).toBe(true);
    expect(isCurrentEditorialVersionReviewed({ ...editorial, about: `${editorial.about} Changed.` }, editorial)).toBe(false);
  });

  it("distinguishes deployed sitemap, deployed robots, proposed, and strict eligibility", () => {
    const result = assessTranslatorIndexingEligibility({
      isActive: true,
      archivedAt: null,
      slug: "useful-translator",
      currentEditorial: editorial,
      latestReviewedPublishedDraft: null,
    });
    expect(result.deployedBaselineIndexable).toBe(true);
    expect(result.deployedBaselineRobotsIndexable).toBe(true);
    expect(result.newVersionIndexable).toBe(true);
    expect(result.strictReviewIndexable).toBe(false);
    expect(result.currentVersionReviewed).toBe(false);
    expect(result.strictReviewExclusionReasonCodes).toContain(
      INDEXING_EXCLUSION_REASON_CODES.currentEditorialNotReviewed,
    );
  });

  it("excludes inactive, archived, and technically incomplete translators", () => {
    expect(assessTranslatorIndexingEligibility({ isActive: false, archivedAt: null, slug: "inactive", currentEditorial: editorial, latestReviewedPublishedDraft: editorial }).newVersionIndexable).toBe(false);
    expect(assessTranslatorIndexingEligibility({ isActive: true, archivedAt: new Date(), slug: "archived", currentEditorial: editorial, latestReviewedPublishedDraft: editorial }).newVersionIndexable).toBe(false);
    const thin = assessTranslatorIndexingEligibility({ isActive: true, archivedAt: null, slug: "thin", currentEditorial: { ...editorial, faq: [] }, latestReviewedPublishedDraft: null });
    expect(thin.deployedBaselineIndexable).toBe(true);
    expect(thin.deployedBaselineRobotsIndexable).toBe(false);
    expect(thin.newVersionIndexable).toBe(false);
    expect(thin.newVersionExclusionReasonCodes).toEqual([
      INDEXING_EXCLUSION_REASON_CODES.technicalEditorialIncomplete,
    ]);
  });
});
