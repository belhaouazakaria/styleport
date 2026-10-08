import { containsEmDash } from "@/lib/text-sanitizer";
import { slugify } from "@/lib/slugify";
import { MAX_IDEA_VERSION_BYTES } from "@/lib/growth/ideas/constants";
import { resolvedIdeaCandidateSchema, type IdeaBlock, type ResolvedIdeaCandidate } from "@/lib/growth/ideas/contracts";

export interface IdeaQualityDiagnostic { code: string; path?: string; message: string }
export interface IdeaQualityResult { valid: boolean; diagnostics: IdeaQualityDiagnostic[]; meaningfulItemCount: number; serializedBytes: number }

const HTML = /<\/?[a-z][^>]*>/i;
const PLACEHOLDER = /\b(?:todo|tbd|lorem ipsum|placeholder|insert (?:copy|text)|example here|coming soon|in today's fast-paced world|it is important to note|delve into)\b/i;
const UNSAFE = /\b(?:javascript:|data:text\/html|onerror\s*=|onclick\s*=|ignore previous instructions|system prompt)\b/i;
const UNSUPPORTED_CLAIM = /\b(?:guaranteed results?|guaranteed to|scientifically proven|officially endorsed)\b/i;
const RESERVED_SLUGS = new Set(["admin", "api", "categories", "new"]);

function allStrings(value: unknown, path = "root"): Array<{ path: string; value: string }> {
  if (typeof value === "string") return [{ path, value }];
  if (Array.isArray(value)) return value.flatMap((item, index) => allStrings(item, `${path}.${index}`));
  if (value && typeof value === "object") return Object.entries(value).flatMap(([key, item]) => allStrings(item, `${path}.${key}`));
  return [];
}

function primaryItems(blocks: IdeaBlock[]) {
  return blocks.flatMap((block) => {
    if (block.type === "IDEA_LIST") return block.items.map((item) => item.text);
    if (block.type === "EXAMPLE_LIST") return block.items.map((item) => item.suggestion);
    if (block.type === "TIP_LIST") return block.items;
    return [];
  });
}

function promisedCount(title: string) {
  const match = title.match(/(?:^|\s)(\d{1,3})(?=\s)/);
  return match ? Number(match[1]) : null;
}

function hasKeywordStuffing(value: string) {
  const words = value.toLowerCase().match(/[a-z0-9]+/g) || [];
  if (words.length < 30) return false;
  const counts = new Map<string, number>();
  for (const word of words.filter((item) => item.length >= 4)) counts.set(word, (counts.get(word) || 0) + 1);
  return [...counts.values()].some((count) => count >= 8 && count / words.length > 0.12);
}

export function validateIdeaQuality(candidate: ResolvedIdeaCandidate, options: { activeTranslatorIds: Set<string>; translatorContextById?: Map<string, string>; previousChecksum?: string | null; checksum?: string } = { activeTranslatorIds: new Set() }): IdeaQualityResult {
  const diagnostics: IdeaQualityDiagnostic[] = [];
  const parsed = resolvedIdeaCandidateSchema.safeParse(candidate);
  if (!parsed.success) for (const issue of parsed.error.issues) diagnostics.push({ code: "SCHEMA_INVALID", path: issue.path.join("."), message: issue.message });
  const serializedBytes = Buffer.byteLength(JSON.stringify(candidate));
  if (serializedBytes > MAX_IDEA_VERSION_BYTES) diagnostics.push({ code: "PAYLOAD_TOO_LARGE", message: "Idea version exceeds the maximum serialized size." });

  const strings = allStrings(candidate);
  for (const item of strings) {
    if (HTML.test(item.value)) diagnostics.push({ code: "HTML_NOT_ALLOWED", path: item.path, message: "Idea content cannot contain HTML." });
    if (PLACEHOLDER.test(item.value)) diagnostics.push({ code: "PLACEHOLDER_TEXT", path: item.path, message: "Placeholder content is not allowed." });
    if (UNSAFE.test(item.value)) diagnostics.push({ code: "UNSAFE_CONTENT", path: item.path, message: "Unsafe instructions or links are not allowed." });
    if (UNSUPPORTED_CLAIM.test(item.value)) diagnostics.push({ code: "UNSUPPORTED_CLAIM", path: item.path, message: "Unsupported promotional or evidence claims are not allowed." });
  }
  if (containsEmDash(candidate)) diagnostics.push({ code: "EM_DASH", message: "Generated public copy cannot contain em dashes." });
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(candidate.slug)) diagnostics.push({ code: "SLUG_INVALID", path: "slug", message: "Slug must be lowercase kebab-case." });
  if (RESERVED_SLUGS.has(candidate.slug)) diagnostics.push({ code: "SLUG_RESERVED", path: "slug", message: "Slug conflicts with a reserved Ideas route." });
  if (candidate.seoTitle.length < 20 || candidate.seoTitle.length > 65) diagnostics.push({ code: "SEO_TITLE_LENGTH", path: "seoTitle", message: "SEO title must be 20 to 65 characters." });
  if (candidate.seoDescription.length < 70 || candidate.seoDescription.length > 160) diagnostics.push({ code: "SEO_DESCRIPTION_LENGTH", path: "seoDescription", message: "SEO description must be 70 to 160 characters." });
  if (hasKeywordStuffing(strings.map((item) => item.value).join(" "))) diagnostics.push({ code: "KEYWORD_STUFFING", message: "Repeated keyword usage is excessive." });

  const items = primaryItems(candidate.blocks);
  const uniqueItems = new Set(items.map(slugify).filter(Boolean));
  if (uniqueItems.size !== items.length) diagnostics.push({ code: "DUPLICATE_ITEMS", message: "Primary list and example items must be unique." });
  const paragraphs = candidate.blocks.filter((block) => block.type === "PARAGRAPH" || block.type === "INTRO").map((block) => block.text);
  if (new Set(paragraphs.map(slugify)).size !== paragraphs.length) diagnostics.push({ code: "DUPLICATE_PARAGRAPHS", message: "Repeated paragraphs are not allowed." });
  let hasLevelTwoHeading = false;
  for (const [index, block] of candidate.blocks.entries()) {
    if (block.type !== "HEADING") continue;
    if (block.level === 2) hasLevelTwoHeading = true;
    if (block.level === 3 && !hasLevelTwoHeading) diagnostics.push({ code: "HEADING_HIERARCHY", path: `blocks.${index}`, message: "A level-three heading must follow a level-two section heading." });
  }
  const valueBlocks = candidate.blocks.filter((block) => ["IDEA_LIST", "EXAMPLE_LIST", "TIP_LIST", "PARAGRAPH"].includes(block.type)).length;
  if ((valueBlocks < 2 && items.length < 8) || (items.length < 5 && paragraphs.join(" ").length < 700)) diagnostics.push({ code: "THIN_CONTENT", message: "Idea needs concrete items, examples, or substantial actionable guidance." });
  const ctas = candidate.blocks.filter((block) => block.type === "TRANSLATOR_CTA" || block.type === "EMBEDDED_TRANSLATOR");
  if (ctas.length > 2 || ctas.length >= candidate.blocks.length / 2) diagnostics.push({ code: "CTA_HEAVY", message: "Editorial value must substantially outweigh calls to action." });
  if (candidate.blocks.filter((block) => block.type === "EMBEDDED_TRANSLATOR").length > 1) diagnostics.push({ code: "TOO_MANY_EMBEDS", message: "Only one embedded Translator is allowed." });
  for (const block of ctas) if (!options.activeTranslatorIds.has(block.translatorId)) diagnostics.push({ code: "TRANSLATOR_REFERENCE_INVALID", message: "Every Translator reference must resolve to an active, non-archived Translator." });
  if (options.translatorContextById) {
    const editorialTokens = new Set(slugify([candidate.title, candidate.excerpt, ...candidate.blocks.filter((block) => block.type !== "TRANSLATOR_CTA" && block.type !== "EMBEDDED_TRANSLATOR").flatMap((block) => allStrings(block).map((item) => item.value))].join(" ")).split("-").filter((token) => token.length >= 4));
    for (const block of ctas) {
      const contextTokens = slugify(options.translatorContextById.get(block.translatorId) || "").split("-").filter((token) => token.length >= 4);
      if (!contextTokens.some((token) => editorialTokens.has(token))) diagnostics.push({ code: "TRANSLATOR_CONTEXT_MISMATCH", message: "Translator calls to action must match the Idea's editorial intent." });
    }
  }
  const count = promisedCount(candidate.title);
  if (count !== null && count !== items.length) diagnostics.push({ code: "NUMERIC_TITLE_MISMATCH", message: `Title promises ${count} primary items but the content contains ${items.length}.` });
  if (options.previousChecksum && options.checksum === options.previousChecksum) diagnostics.push({ code: "NO_MATERIAL_CHANGE", message: "Improvement must change the semantic content checksum." });
  return { valid: diagnostics.length === 0, diagnostics, meaningfulItemCount: items.length, serializedBytes };
}
