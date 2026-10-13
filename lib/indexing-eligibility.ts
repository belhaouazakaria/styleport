import { assessEditorialQuality } from "@/lib/editorial-quality";
import type { TranslatorEditorialDraft } from "@/lib/types";

export const CURRENT_REVIEW_ENFORCEMENT_ENABLED = false;

export const INDEXING_EXCLUSION_REASON_CODES = {
  missingPublicSlug: "MISSING_PUBLIC_SLUG",
  inactive: "INACTIVE",
  archived: "ARCHIVED",
  technicalEditorialIncomplete: "TECHNICAL_EDITORIAL_INCOMPLETE",
  currentEditorialNotReviewed: "CURRENT_EDITORIAL_NOT_REVIEWED",
  editorialQualityRequirementsNotMet: "EDITORIAL_QUALITY_REQUIREMENTS_NOT_MET",
} as const;

export type IndexingExclusionReasonCode =
  (typeof INDEXING_EXCLUSION_REASON_CODES)[keyof typeof INDEXING_EXCLUSION_REASON_CODES];

export interface TranslatorIndexingEligibilityInput {
  isActive: boolean;
  archivedAt: Date | string | null;
  slug: string;
  currentEditorial: TranslatorEditorialDraft;
  latestReviewedPublishedDraft: TranslatorEditorialDraft | null;
}

export interface TranslatorIndexingEligibility {
  deployedBaselineIndexable: boolean;
  deployedBaselineRobotsIndexable: boolean;
  newVersionIndexable: boolean;
  strictReviewIndexable: boolean;
  technicallyReady: boolean;
  currentVersionReviewed: boolean;
  reviewEnforcementEnabled: boolean;
  newVersionExclusionReasonCodes: IndexingExclusionReasonCode[];
  strictReviewExclusionReasonCodes: IndexingExclusionReasonCode[];
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
  const hasPublicSlug = Boolean(input.slug.trim());
  const publiclyAvailable = hasPublicSlug && input.isActive && !input.archivedAt;
  const deployedBaselineIndexable = publiclyAvailable;
  const deployedBaselineRobotsIndexable = publiclyAvailable && quality.technicallyComplete;
  const strictReviewIndexable = publiclyAvailable && quality.eligibleForIndexing;
  const newVersionIndexable = publiclyAvailable && quality.technicallyComplete &&
    (!reviewEnforcementEnabled || currentVersionReviewed);
  const availabilityReasonCodes: IndexingExclusionReasonCode[] = [];
  if (!hasPublicSlug) availabilityReasonCodes.push(INDEXING_EXCLUSION_REASON_CODES.missingPublicSlug);
  if (!input.isActive) availabilityReasonCodes.push(INDEXING_EXCLUSION_REASON_CODES.inactive);
  if (input.archivedAt) availabilityReasonCodes.push(INDEXING_EXCLUSION_REASON_CODES.archived);

  const newVersionExclusionReasonCodes = [...availabilityReasonCodes];
  if (!quality.technicallyComplete) {
    newVersionExclusionReasonCodes.push(INDEXING_EXCLUSION_REASON_CODES.technicalEditorialIncomplete);
  }
  if (reviewEnforcementEnabled && !currentVersionReviewed) {
    newVersionExclusionReasonCodes.push(INDEXING_EXCLUSION_REASON_CODES.currentEditorialNotReviewed);
  }

  const strictReviewExclusionReasonCodes = [...availabilityReasonCodes];
  if (!quality.technicallyComplete) {
    strictReviewExclusionReasonCodes.push(INDEXING_EXCLUSION_REASON_CODES.technicalEditorialIncomplete);
  }
  if (!currentVersionReviewed) {
    strictReviewExclusionReasonCodes.push(INDEXING_EXCLUSION_REASON_CODES.currentEditorialNotReviewed);
  }
  if (quality.technicallyComplete && quality.issues.some((issue) => issue !== "Human editorial review is required")) {
    strictReviewExclusionReasonCodes.push(INDEXING_EXCLUSION_REASON_CODES.editorialQualityRequirementsNotMet);
  }
  const reasons: string[] = [];

  if (!input.slug.trim()) reasons.push("A public slug is required");
  if (!input.isActive) reasons.push("Translator is inactive");
  if (input.archivedAt) reasons.push("Translator is archived");
  reasons.push(...quality.issues);

  return {
    deployedBaselineIndexable,
    deployedBaselineRobotsIndexable,
    newVersionIndexable,
    strictReviewIndexable,
    technicallyReady: quality.technicallyComplete,
    currentVersionReviewed,
    reviewEnforcementEnabled,
    newVersionExclusionReasonCodes: [...new Set(newVersionExclusionReasonCodes)],
    strictReviewExclusionReasonCodes: [...new Set(strictReviewExclusionReasonCodes)],
    reasons: [...new Set(reasons)],
  };
}
