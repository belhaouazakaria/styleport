/**
 * Keeps the daily Pin plan from repeating itself. Topics are compared by their
 * meaningful words, so "Anime Style Speech" and "Anime Language" count as the
 * same idea, and a theme that was promoted recently waits behind fresh ones.
 */
const NOISE = new Set([
  "translator", "translators", "translation", "translate", "language", "style",
  "speak", "speaking", "speech", "talk", "text", "converter", "generator",
  "the", "to", "from", "of", "a", "an", "and", "for", "english", "like",
  "mode", "voice", "way", "wording", "rewrite", "rewriter", "ai", "free",
]);

export function topicTokens(value: string): string[] {
  return [
    ...new Set(
      value
        .toLowerCase()
        .replace(/['’]/g, "")
        .split(/[^a-z0-9]+/)
        .filter(Boolean)
        .map((token) => (token.length > 3 && token.endsWith("s") ? token.slice(0, -1) : token))
        .filter((token) => !NOISE.has(token)),
    ),
  ];
}

export function themeKey(value: string): string | null {
  return topicTokens(value)[0] ?? null;
}

export function isNearDuplicateTopic(title: string, existing: string[][]): boolean {
  const tokens = topicTokens(title);
  if (!tokens.length) return false;
  const mine = new Set(tokens);
  return existing.some((other) => {
    if (!other.length) return false;
    const theirs = new Set(other);
    const shared = [...mine].filter((token) => theirs.has(token)).length;
    if (!shared) return false;
    const smaller = Math.min(mine.size, theirs.size);
    const larger = Math.max(mine.size, theirs.size);
    // Same words, or one name fully contained in the other with at most one extra word.
    return shared === smaller && larger - smaller <= 1;
  });
}

/**
 * Order candidates so that pages with unique content come first, a theme used
 * recently waits, and no theme repeats until every other theme had a turn.
 * Stable and deterministic: ties keep their incoming order.
 */
export function diversifyTargets<T extends { slug: string; hasUniquePage?: boolean }>(
  targets: T[],
  recentSlugs: string[],
): T[] {
  const recentThemes = new Set(
    recentSlugs.map((slug) => themeKey(slug)).filter((key): key is string => Boolean(key)),
  );
  const ranked = [...targets].sort((a, b) => {
    const unique = Number(Boolean(b.hasUniquePage)) - Number(Boolean(a.hasUniquePage));
    if (unique) return unique;
    const recentA = recentThemes.has(themeKey(a.slug) ?? "") ? 1 : 0;
    const recentB = recentThemes.has(themeKey(b.slug) ?? "") ? 1 : 0;
    return recentA - recentB;
  });
  const firstPass: T[] = [];
  const rest: T[] = [];
  const used = new Set<string>();
  for (const target of ranked) {
    const key = themeKey(target.slug) ?? target.slug;
    if (used.has(key)) rest.push(target);
    else {
      used.add(key);
      firstPass.push(target);
    }
  }
  return [...firstPass, ...rest];
}
