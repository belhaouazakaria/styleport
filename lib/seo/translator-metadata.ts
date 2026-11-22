const TITLE_LIMIT = 60;
const DESCRIPTION_LIMIT = 158;

function clean(value: string | null | undefined) {
  return (value || "").replace(/\s+/g, " ").trim();
}

/** Cut at the last whole word within `limit`, without adding an ellipsis. */
export function truncateAtWord(value: string, limit: number) {
  const text = clean(value);
  if (text.length <= limit) return text;
  const slice = text.slice(0, limit + 1);
  const lastSpace = slice.lastIndexOf(" ");
  const base = lastSpace > limit * 0.6 ? slice.slice(0, lastSpace) : text.slice(0, limit);
  const trimmed = base.replace(/[\s,;:\-–—&|(]+$/u, "").trim();
  // Never end on a dangling connector word such as "for", "and" or "to".
  return trimmed.replace(/(?:\s+(?:for|and|to|of|with|in|a|an|the|or|into|your|on|at|by))+$/iu, "").trim();
}

/**
 * Page title for a translator. Uses the stored seoTitle (distinct per page, so
 * duplicate-named translators no longer share a title), trimmed to a SERP-safe
 * length. Falls back to the translator name. Returns an absolute title because
 * the stored title already names the tool; the brand is appended when it fits.
 */
export function buildTranslatorTitle(input: {
  seoTitle?: string | null;
  name: string;
  brand: string;
}) {
  const brand = clean(input.brand);
  const base = truncateAtWord(clean(input.seoTitle) || clean(input.name), TITLE_LIMIT);
  const withBrand = brand ? `${base} | ${brand}` : base;
  return withBrand.length <= TITLE_LIMIT ? withBrand : base;
}

export function buildTranslatorDescription(input: {
  seoDescription?: string | null;
  shortDescription?: string | null;
  fallback: string;
}) {
  const source = clean(input.seoDescription) || clean(input.shortDescription) || clean(input.fallback);
  return truncateAtWord(source, DESCRIPTION_LIMIT);
}
