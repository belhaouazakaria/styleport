import { z } from "zod";

export const nicheSuggestionSchema = z.object({
  title: z.string().trim().min(8).max(100),
  intent: z.string().trim().min(20).max(280),
  relationship: z.enum(["SUBNICHE", "ADJACENT", "STYLE_VARIATION", "AUDIENCE_VARIATION"]),
  evidence: z.string().trim().min(20).max(280),
}).strict();

export type NicheSuggestion = z.infer<typeof nicheSuggestionSchema>;
export type NicheExpansionResult = {
  suggestions: Array<NicheSuggestion & { normalizedKey: string }>;
  skipped: string[];
  requiresOriginalGeneration: true;
  translatorPublicationAuthorized: false;
  pinterestPublicationAuthorized: false;
};

export function normalizeTranslatorConcept(title: string): string {
  return title.normalize("NFKD").toLowerCase()
    .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, " ")
    .replace(/\b(translator|translate|generator|tool|online|free)\b/g, " ")
    .replace(/\s+/g, " ").trim();
}

/** AI/topic discovery is an injected input; never generate from copied prompts. */
export function planNicheExpansion(
  originalTitle: string,
  proposals: unknown[],
  existingTitles: string[],
  maxNew: number,
): NicheExpansionResult {
  if (!Number.isSafeInteger(maxNew) || maxNew < 0 || maxNew > 10 ||
      proposals.length > 100 || existingTitles.length > 10000) {
    throw Error("NICHE_LIMIT_INVALID");
  }
  const original = normalizeTranslatorConcept(originalTitle);
  if (original.length < 3) throw Error("NICHE_ORIGIN_INVALID");
  const seen = new Set(existingTitles.map(normalizeTranslatorConcept).concat(original));
  const suggestions: NicheExpansionResult["suggestions"] = [];
  const skipped: string[] = [];
  for (const raw of proposals) {
    const result = nicheSuggestionSchema.safeParse(raw);
    if (!result.success) { skipped.push("INVALID_SUGGESTION"); continue; }
    const key = normalizeTranslatorConcept(result.data.title);
    if (key.length < 3 || seen.has(key) ||
        key.startsWith(original + " ") || original.startsWith(key + " ")) {
      skipped.push("DUPLICATE_OR_THIN_VARIATION"); continue;
    }
    if (suggestions.length >= maxNew) { skipped.push("DAILY_OR_NICHE_CAP"); break; }
    seen.add(key);
    suggestions.push({ ...result.data, normalizedKey: key });
  }
  return {
    suggestions, skipped, requiresOriginalGeneration: true,
    translatorPublicationAuthorized: false, pinterestPublicationAuthorized: false,
  };
}
