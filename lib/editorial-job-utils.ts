import { TranslatorEditorialJobType } from "@prisma/client";

import type { TranslatorEditorialDraft } from "@/lib/types";
import { translatorDraftSchema } from "@/lib/validators";

function meaningful(value: string | null | undefined, minimum = 2) {
  return Boolean(value?.trim() && value.trim().length >= minimum);
}

export function getMissingEditorialSections(current: TranslatorEditorialDraft) {
  const missing = new Set<keyof TranslatorEditorialDraft>();
  if (!meaningful(current.about, 40)) missing.add("about");
  if (!meaningful(current.whatItDoes, 40)) missing.add("whatItDoes");
  if (!meaningful(current.differenceDescription, 40)) missing.add("differenceDescription");
  if (current.bestUses.filter((item) => meaningful(item, 5)).length < 2) missing.add("bestUses");
  if (current.howToUse.filter((item) => meaningful(item, 5)).length < 2) missing.add("howToUse");
  if (current.tips.filter((item) => meaningful(item, 5)).length < 2) missing.add("tips");
  if (current.examples.filter((item) => meaningful(item.originalText, 2) && meaningful(item.transformedText, 2)).length < 3) missing.add("examples");
  if (current.faq.filter((item) => meaningful(item.question, 5) && meaningful(item.answer, 10)).length < 3) missing.add("faq");
  return missing;
}

export function mergeEditorialDraft(current: TranslatorEditorialDraft, generated: TranslatorEditorialDraft, operation: TranslatorEditorialJobType) {
  const result = { ...current };
  const sections = operation === TranslatorEditorialJobType.GENERATE_MISSING
    ? getMissingEditorialSections(current)
    : operation === TranslatorEditorialJobType.REGENERATE_FULL
      ? new Set<keyof TranslatorEditorialDraft>(["about", "whatItDoes", "differenceDescription", "bestUses", "howToUse", "tips", "examples", "faq"])
      : new Set<keyof TranslatorEditorialDraft>([
          operation === TranslatorEditorialJobType.REGENERATE_ABOUT ? "about" : operation === TranslatorEditorialJobType.REGENERATE_EXAMPLES ? "examples" : operation === TranslatorEditorialJobType.REGENERATE_FAQ ? "faq" : "tips",
        ]);
  for (const section of sections) result[section] = generated[section] as never;
  return result;
}

export function validateEditorialDraft(draft: TranslatorEditorialDraft) {
  const parsed = translatorDraftSchema.shape.editorial.safeParse(draft);
  const values = [...draft.bestUses, ...draft.howToUse, ...draft.tips, ...draft.examples.flatMap((item) => [item.originalText, item.transformedText]), ...draft.faq.flatMap((item) => [item.question, item.answer])].map((value) => value.trim().toLowerCase());
  const duplicateFlags = values.filter((value, index) => value && values.indexOf(value) !== index).slice(0, 10);
  return { valid: parsed.success, duplicateFlags, errors: parsed.success ? [] : parsed.error.issues.slice(0, 12).map((issue) => `${issue.path.join(".")}: ${issue.message}`) };
}
