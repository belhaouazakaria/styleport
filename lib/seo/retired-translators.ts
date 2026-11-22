/**
 * Duplicate "-2" translators that were retired. Each URL permanently redirects
 * to the original translator on the same host, so old links, pins and search
 * results keep working and no 404 is created. The translators themselves are
 * archived in the database (reversible via the admin or unarchiveTranslator).
 */
const RETIRED_SLUGS = [
  "aggressive-translator-2",
  "badass-translator-2",
  "censoring-words-translator-2",
  "cold-hearted-cunning-manipulative-translator-2",
  "emo-teen-translator-2",
  "error-message-translator-2",
  "freaky-translator-2",
  "gen-a-slang-translator-2",
  "genshin-impact-translator-2",
  "lots-of-description-translator-2",
  "mom-translator-2",
  "pick-me-translator-2",
  "rizzler-mode-translator-2",
  "russian-translator-2",
  "sarcastic-translator-2",
  "the-narrator-translator-2",
  "worlds-longest-english-translator-2",
] as const;

/** Retired slugs whose replacement is not simply the slug without "-2". */
const DESTINATION_OVERRIDES: Record<string, string> = {
  // Kept as its own tool under a distinct name and slug.
  "error-message-translator-2": "snarky-error-message-translator",
};

/** Slugs that were replaced by another translator taking over the canonical URL. */
const REPLACED_BY: Array<{ from: string; to: string }> = [
  // "Russian 2.0" now lives at /translators/russian-translator.
  { from: "russian-2-0-translator", to: "russian-translator" },
];

export const RETIRED_TRANSLATOR_REDIRECTS = [
  ...RETIRED_SLUGS.map((slug) => ({
    source: `/translators/${slug}`,
    destination: `/translators/${DESTINATION_OVERRIDES[slug] ?? slug.replace(/-2$/, "")}`,
    permanent: true,
  })),
  ...REPLACED_BY.map(({ from, to }) => ({
    source: `/translators/${from}`,
    destination: `/translators/${to}`,
    permanent: true,
  })),
];
