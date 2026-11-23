/**
 * Sitemap curation. Google reported most templated translator pages as
 * "Crawled - currently not indexed", so the sitemap now offers only pages that
 * have earned their place:
 *
 *  - pages with published unique page blocks (added automatically), and
 *  - this keep-list: pages Google already indexed or already showed in search
 *    (taken from Search Console on 2026-11-23: indexed, or at least one click).
 *
 * Every other translator stays live and reachable but is left out of the
 * sitemap until it gets unique content. Remove a slug from this list only
 * when it has its own unique blocks.
 */
export const SITEMAP_KEEP_SLUGS: ReadonlySet<string> = new Set<string>([
  "15land-d3ment3d-dream-3rr0r-translator",
  "1800s-english-translator",
  "animal-equivalent-translator",
  "babytv-translator",
  "bicol-translator",
  "bored-not-interested-swearing-translator",
  "code-to-english-translator",
  "comedy-bender",
  "cool-translator-translator",
  "cursed-text-translator",
  "cute-speech-translator",
  "distorted-50-times-translator",
  "english-but-bigger-translator",
  "english-to-slang-translator",
  "flirty-translator",
  "fluttershy-translator",
  "freaky-translator",
  "funny-funny-translator",
  "glosa-translator",
  "hacker-translator",
  "hetty-jollibee-language-translator",
  "homophone-translator",
  "huave-translator",
  "jester-translator",
  "kalinago-island-carib-translator",
  "kcr-style-telangana-slang-translator",
  "lolo-catz-translator",
  "lonely-language-translator",
  "medieval-knight-speaking-style-translator",
  "mockery-translator",
  "mom-translator",
  "muffled-voice-translator",
  "opposite-translator-translator",
  "polite-english-translator",
  "rhyming-translator",
  "roaster-translator",
  "sarcastic-translator",
  "scientific-name-translator",
  "spamton-g-spamton-translator",
  "stone-age-translator",
  "super-duper-long-fancy-english-translator",
  "swahili-ajami-translator",
  "tepehua-translator",
  "tonystark-translator",
]);

export function isSitemapWorthy(slug: string, hasUniquePage: boolean): boolean {
  return hasUniquePage || SITEMAP_KEEP_SLUGS.has(slug);
}
