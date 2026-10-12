import { assessEditorialQuality } from "@/lib/editorial-quality";
import type { TranslatorEditorialDraft } from "@/lib/types";

export const CURRENT_REVIEW_ENFORCEMENT_ENABLED = false;

export interface TranslatorIndexingEligibilityInput {
  isActive: boolean;
  archivedAt: Date | string | null;
  slug: string;
  currentEditorial: TranslatorEditorialDraft;
  latestReviewedPublishedDraft: TranslatorEditorialDraft | null;
}

export interface TranslatorIndexingEligibility {
  indexable: boolean;
  strictIndexable: boolean;
  technicallyReady: boolean;
  currentVersionReviewed: boolean;
  reviewEnforcementEnabled: boolean;
  reasons: string[];
}

function normalizeString(value: string) {
  return value.replace(/\r\n/g, "\n").trim();
}

function canonicalizeEditorial(draft: TranslatorEditorialDraft) {
  return {
    about: normalizeString(draft.about),
    whatItDoes: normalizeString(draft.whatItDoes),
    differenceDescription: normalizeString(draft.differenceDescription),
    bestUses: draft.bestUses.map(normalizeString),
    howToUse: draft.howToUse.map(normalizeString),
    tips: draft.tips.map(normalizeString),
    examples: draft.examples.map((item) => ({
      contextTitle: normalizeString(item.contextTitle || ""),
      originalText: normalizeString(item.originalText),
      transformedText: normalizeString(item.transformedText),
    })),
    faq: draft.faq.map((item) => ({
      question: normalizeString(item.question),
      answer: normalizeString(item.answer),
    })),
  };
}

export function isCurrentEditorialVersionReviewed(
  current: TranslatorEditorialDraft,
  reviewedPublishedDraft: TranslatorEditorialDraft | null,
) {
  if (!reviewedPublishedDraft) return false;
  return JSON.stringify(canonicalizeEditorial(current)) === JSON.stringify(canonicalizeEditorial(reviewedPublishedDraft));
}

export function assessTranslatorIndexingEligibility(
  input: TranslatorIndexingEligibilityInput,
  options: { enforceCurrentReview?: boolean } = {},
): TranslatorIndexingEligibility {
  const reviewEnforcementEnabled =
    options.enforceCurrentReview ?? CURRENT_REVIEW_ENFORCEMENT_ENABLED;
  const currentVersionReviewed = isCurrentEditorialVersionReviewed(
    input.currentEditorial,
    input.latestReviewedPublishedDraft,
  );
  const quality = assessEditorialQuality(input.currentEditorial, {
    humanReviewed: currentVersionReviewed,
  });
  const publiclyAvailable = Boolean(input.slug.trim()) && input.isActive && !input.archivedAt;
  const strictIndexable = publiclyAvailable && quality.eligibleForIndexing;
  const indexable = publiclyAvailable && quality.technicallyComplete &&
    (!reviewEnforcementEnabled || currentVersionReviewed);
  const reasons: string[] = [];

  if (!input.slug.trim()) reasons.push("A public slug is required");
  if (!input.isActive) reasons.push("Translator is inactive");
  if (input.archivedAt) reasons.push("Translator is archived");
  reasons.push(...quality.issues);

  return {
    indexable,
    strictIndexable,
    technicallyReady: quality.technicallyComplete,
    currentVersionReviewed,
    reviewEnforcementEnabled,
    reasons: [...new Set(reasons)],
  };
}
