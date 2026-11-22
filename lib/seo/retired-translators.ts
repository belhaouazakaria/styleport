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

export const RETIRED_TRANSLATOR_REDIRECTS = RETIRED_SLUGS.map((slug) => ({
  source: `/translators/${slug}`,
  destination: `/translators/${slug.replace(/-2$/, "")}`,
  permanent: true,
}));
