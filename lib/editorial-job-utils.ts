import { TranslatorEditorialJobType } from "@prisma/client";

import type { TranslatorEditorialDraft } from "@/lib/types";
import { getEditorialDraftReadiness, getMissingEditorialSections, type EditorialSectionKey } from "@/lib/translator-editorial-data";
import { translatorEditorialCandidateSchema } from "@/lib/validators";

export { getMissingEditorialSections } from "@/lib/translator-editorial-data";

export const ALL_EDITORIAL_SECTIONS: EditorialSectionKey[] = [
  "about",
  "whatItDoes",
  "differenceDescription",
  "bestUses",
  "howToUse",
  "tips",
  "examples",
  "faq",
];

export function getExpectedEditorialSections(current: TranslatorEditorialDraft, operation: TranslatorEditorialJobType) {
  if (operation === TranslatorEditorialJobType.GENERATE_MISSING) return getMissingEditorialSections(current);
  if (operation === TranslatorEditorialJobType.REGENERATE_FULL) return new Set(ALL_EDITORIAL_SECTIONS);
  const sectionByOperation: Record<Exclude<TranslatorEditorialJobType, "GENERATE_MISSING" | "REGENERATE_FULL">, EditorialSectionKey> = {
    REGENERATE_ABOUT: "about",
    REGENERATE_WHAT_IT_DOES: "whatItDoes",
    REGENERATE_DIFFERENCE: "differenceDescription",
    REGENERATE_BEST_USES: "bestUses",
    REGENERATE_HOW_TO_USE: "howToUse",
    REGENERATE_EXAMPLES: "examples",
    REGENERATE_FAQ: "faq",
    REGENERATE_TIPS: "tips",
  };
  return new Set<EditorialSectionKey>([sectionByOperation[operation]]);
}

export function mergeEditorialDraft(current: TranslatorEditorialDraft, generated: TranslatorEditorialDraft, operation: TranslatorEditorialJobType) {
  const result = { ...current };
  const sections = getExpectedEditorialSections(current, operation);
  for (const section of sections) result[section] = generated[section] as never;
  return result;
}

export function validateEditorialDraft(draft: TranslatorEditorialDraft, expectedSections: Iterable<EditorialSectionKey> = []) {
  const parsed = translatorEditorialCandidateSchema.safeParse(draft);
  const readiness = getEditorialDraftReadiness(draft);
  const missingAfterGeneration = getMissingEditorialSections(draft);
  const expected = [...expectedSections];
  const missingExpectedSections = expected.filter((section) => missingAfterGeneration.has(section));
  const values = [...draft.bestUses, ...draft.howToUse, ...draft.tips, ...draft.examples.flatMap((item) => [item.originalText, item.transformedText]), ...draft.faq.flatMap((item) => [item.question, item.answer])].map((value) => value.trim().toLowerCase());
  const duplicateFlags = values.filter((value, index) => value && values.indexOf(value) !== index).slice(0, 10);
  const errors = parsed.success ? [] : parsed.error.issues.slice(0, 12).map((issue) => `${issue.path.join(".")}: ${issue.message}`);
  if (missingExpectedSections.length) errors.push("Generated editorial draft contained no content for the requested missing sections.");
  return {
    valid: parsed.success && missingExpectedSections.length === 0,
    duplicateFlags,
    errors,
    expectedSections: expected,
    generatedSections: expected.filter((section) => !missingAfterGeneration.has(section)),
    missingExpectedSections,
    readiness,
  };
}
