import type { TranslatorEditorialDraft } from "@/lib/types";
import { getEditorialDraftReadiness } from "@/lib/translator-editorial-data";

export type EditorialQualityStatus =
  "INCOMPLETE" | "NEEDS_EDITORIAL_REVIEW" | "REVIEWED";

export interface EditorialQualityAssessment {
  status: EditorialQualityStatus;
  technicallyComplete: boolean;
  humanReviewed: boolean;
  eligibleForIndexing: boolean;
  issues: string[];
}

const GENERIC_FILLER =
  /\b(?:in today'?s fast-paced world|delve into|unlock the power|game[- ]changer|elevate your|whether you'?re|it is important to note)\b/i;

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function opening(value: string) {
  return normalize(value).split(" ").slice(0, 5).join(" ");
}

function hasRepeatedOpenings(values: string[]) {
  const openings = values
    .map(opening)
    .filter((value) => value.split(" ").length >= 4);
  return new Set(openings).size !== openings.length;
}

export function assessEditorialQuality(
  draft: TranslatorEditorialDraft,
  options: { humanReviewed: boolean },
): EditorialQualityAssessment {
  const readiness = getEditorialDraftReadiness(draft);
  const issues = [...readiness.missing];
  const allCopy = [
    draft.about,
    draft.whatItDoes,
    draft.differenceDescription,
    ...draft.bestUses,
    ...draft.howToUse,
    ...draft.tips,
    ...draft.examples.flatMap((item) => [
      item.contextTitle,
      item.originalText,
      item.transformedText,
    ]),
    ...draft.faq.flatMap((item) => [item.question, item.answer]),
  ].filter((value): value is string => Boolean(value));

  if (draft.about.trim().length < 120)
    issues.push("About needs more translator-specific context");
  if (draft.whatItDoes.trim().length < 70)
    issues.push("What it does needs a concrete explanation");
  if (draft.differenceDescription.trim().length < 90) {
    issues.push("Differences and limitations need more detail");
  }
  if (draft.bestUses.length < 3)
    issues.push("At least three realistic best uses are required");
  if (draft.howToUse.length < 3)
    issues.push("At least three practical steps are required");
  if (draft.tips.length < 3)
    issues.push("At least three translator-specific tips are required");
  if (
    draft.examples.some(
      (item) =>
        (item.contextTitle || "").trim().length < 4 ||
        normalize(item.originalText) === normalize(item.transformedText),
    )
  ) {
    issues.push(
      "Examples need a real context and a meaningfully transformed result",
    );
  }
  if (allCopy.some((value) => GENERIC_FILLER.test(value))) {
    issues.push("Generic AI-style filler requires rewriting");
  }
  if (
    hasRepeatedOpenings([
      ...draft.bestUses,
      ...draft.howToUse,
      ...draft.tips,
      ...draft.faq.map((item) => item.answer),
    ])
  ) {
    issues.push("Repeated sentence openings require editorial revision");
  }
  if (!options.humanReviewed) issues.push("Human editorial review is required");

  const uniqueIssues = [...new Set(issues)];
  const technicallyComplete = readiness.status === "READY";
  const eligibleForIndexing =
    technicallyComplete && options.humanReviewed && uniqueIssues.length === 0;

  return {
    status: eligibleForIndexing
      ? "REVIEWED"
      : technicallyComplete
        ? "NEEDS_EDITORIAL_REVIEW"
        : "INCOMPLETE",
    technicallyComplete,
    humanReviewed: options.humanReviewed,
    eligibleForIndexing,
    issues: uniqueIssues,
  };
}
