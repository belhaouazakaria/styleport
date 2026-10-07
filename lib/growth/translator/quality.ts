import type { TranslatorUpsertInput } from "@/lib/types";
import { translatorUpsertSchema } from "@/lib/validators";
import { slugify } from "@/lib/slugify";

export interface QualityDiagnostic {
  code: string;
  path?: string;
  message: string;
}

export interface TranslatorQualityResult {
  valid: boolean;
  diagnostics: QualityDiagnostic[];
  changedFields: string[];
}

const PLACEHOLDER = /\b(?:todo|tbd|lorem ipsum|placeholder|insert (?:text|copy)|example here)\b/i;
const HTML = /<\/?[a-z][^>]*>/i;

function strings(value: unknown, path = "root"): Array<{ path: string; value: string }> {
  if (typeof value === "string") return [{ path, value }];
  if (Array.isArray(value)) return value.flatMap((item, index) => strings(item, `${path}.${index}`));
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, item]) => strings(item, `${path}.${key}`));
  }
  return [];
}

function duplicateValues(values: string[]) {
  const seen = new Set<string>();
  return values.some((value) => {
    const key = slugify(value);
    if (seen.has(key)) return true;
    seen.add(key);
    return false;
  });
}

function comparable(input: TranslatorUpsertInput) {
  return {
    name: input.name,
    title: input.title,
    subtitle: input.subtitle,
    shortDescription: input.shortDescription,
    sourceLabel: input.sourceLabel,
    targetLabel: input.targetLabel,
    promptSystem: input.promptSystem,
    promptInstructions: input.promptInstructions,
    seoTitle: input.seoTitle || "",
    seoDescription: input.seoDescription || "",
    primaryCategoryId: input.primaryCategoryId || null,
    categoryIds: [...input.categoryIds].sort(),
    modes: input.modes,
    examples: input.examples,
    editorial: input.editorial,
  };
}

export function validateTranslatorQuality(
  input: TranslatorUpsertInput,
  options: { activeCategoryIds: Set<string>; previous?: TranslatorUpsertInput | null } = { activeCategoryIds: new Set() },
): TranslatorQualityResult {
  const diagnostics: QualityDiagnostic[] = [];
  const parsed = translatorUpsertSchema.safeParse(input);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) diagnostics.push({ code: "SCHEMA_INVALID", path: issue.path.join("."), message: issue.message });
  }
  if (!input.categoryIds.length || input.categoryIds.some((id) => !options.activeCategoryIds.has(id))) {
    diagnostics.push({ code: "CATEGORY_INVALID", path: "categoryIds", message: "Every category must be active and server-resolved." });
  }
  if (!input.primaryCategoryId || !input.categoryIds.includes(input.primaryCategoryId)) {
    diagnostics.push({ code: "PRIMARY_CATEGORY_INVALID", path: "primaryCategoryId", message: "Primary category must belong to the category set." });
  }
  if (duplicateValues(input.modes.map((mode) => mode.key))) diagnostics.push({ code: "DUPLICATE_MODE", path: "modes", message: "Mode keys must be unique." });
  if (duplicateValues(input.examples.map((example) => `${example.label}:${example.value}`))) diagnostics.push({ code: "DUPLICATE_EXAMPLE", path: "examples", message: "Examples must be unique." });
  if (input.modes.length < 1 || input.modes.length > 4) diagnostics.push({ code: "MODE_COUNT_INVALID", path: "modes", message: "Growth translators require 1 to 4 modes." });
  if (!input.editorial?.lists?.length || !input.editorial.examples?.length || !input.editorial.faq?.length) {
    diagnostics.push({ code: "EDITORIAL_INCOMPLETE", path: "editorial", message: "A complete generated editorial pack is required." });
  }
  const prompt = `${input.promptSystem} ${input.promptInstructions}`.toLowerCase();
  if (!/(transform|rewrite|convert|translate)/.test(prompt)) diagnostics.push({ code: "PURPOSE_UNCLEAR", path: "promptSystem", message: "Prompt must state a clear transformation purpose." });
  if (!/(preserve|retain|keep).{0,40}(meaning|fact|intent)/.test(prompt)) diagnostics.push({ code: "MEANING_PRESERVATION_MISSING", path: "promptInstructions", message: "Prompt must preserve meaning, facts, or intent." });
  if (/(invent|fabricate|hallucinate).{0,30}(fact|claim|detail)/.test(prompt) && !/(do not|never|without)/.test(prompt)) diagnostics.push({ code: "HALLUCINATION_INSTRUCTION", path: "promptInstructions", message: "Prompt may not instruct factual invention." });
  if (slugify(input.name).replace(/-translator$/, "") === "ai" || slugify(input.name) === "translator") diagnostics.push({ code: "GENERIC_CLONE", path: "name", message: "Translator concept must be distinct." });
  for (const item of strings(input)) {
    if (item.value.includes("—")) diagnostics.push({ code: "EM_DASH", path: item.path, message: "Generated user-facing content cannot contain an em dash." });
    if (PLACEHOLDER.test(item.value)) diagnostics.push({ code: "PLACEHOLDER_TEXT", path: item.path, message: "Placeholder text is not allowed." });
    if (HTML.test(item.value)) diagnostics.push({ code: "HTML_NOT_ALLOWED", path: item.path, message: "Generated content cannot contain HTML." });
  }

  const previous = options.previous ? comparable(options.previous) : null;
  const current = comparable(input);
  const changedFields = previous
    ? Object.keys(current).filter((key) => JSON.stringify(current[key as keyof typeof current]) !== JSON.stringify(previous[key as keyof typeof previous]))
    : Object.keys(current);
  if (previous && changedFields.length === 0) diagnostics.push({ code: "NO_MATERIAL_CHANGE", message: "Improvement must change at least one managed field." });
  return { valid: diagnostics.length === 0, diagnostics, changedFields };
}

