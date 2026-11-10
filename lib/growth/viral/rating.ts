import { canonicalSourceTranslatorUrl } from "@/lib/growth/viral/catalog";

/**
 * Conservative editorial-fit heuristic, not third-party engagement or demand.
 * Uses only public title/URL metadata already collected in the catalog scan.
 * The output is reproducible: no paid AI, network requests or copied content.
 */
export type SourceRatingDecision = "PRIORITY" | "SCHEDULE_LATER" | "WITHDRAW";

export type SourceRating = {
  score: number;
  decision: SourceRatingDecision;
  reasons: string[];
  suggestedDelayDays: number | null;
};

export const SOURCE_PRIORITY_THRESHOLD = 75;
export const SOURCE_DEFER_THRESHOLD = 50;
export const SOURCE_RATING_VERSION = "source-editorial-v1";

const STYLES = new Set([
  "poetic", "royal", "pirate", "romantic", "sarcastic", "polite",
  "professional", "formal", "casual", "friendly", "funny", "comedic",
  "shakespearean", "medieval", "victorian", "gothic", "fantasy",
  "detective", "dramatic", "gentle", "mysterious", "whimsical",
  "slang", "anime", "meme", "internet", "retro", "classic", "elegant",
  "pirates", "cowboy", "business", "scientific", "fairytale",
]);
const RELEVANT = new Set([
  "english", "text", "words", "word", "language", "slang", "speech",
  "speaking", "phrases", "phrase", "tone", "style", "dialect", "meme",
  "accent", "expressions", "writing", "voice",
]);
const VAGUE = new Set(["normal", "average", "only", "in", "really", "just",
  "very", "something", "some", "stuff", "other", "random"]);
const NOISY = /[+…_]|\b(?:mene|test|tryhard|asdf|unknown|untitled|copy|version|v\d+)\b/i;

/**
 * High scores rank editorial clarity only, not popularity.
 * Actual winner promotion must continue to require official owned-Pin data.
 */
export function rateSourceTranslator(title: string, sourceUrl: string): SourceRating {
  const clean = title.replace(/\s+/g, " ").trim();
  if (canonicalSourceTranslatorUrl(sourceUrl) !== sourceUrl ||
      !/^.{5,100}$/u.test(clean) || !/\s+translator$/i.test(clean) ||
      /[<>\x00-\x1f\x7f]/.test(clean)) {
    return { score: 0, decision: "WITHDRAW",
      reasons: ["INVALID_SOURCE_OR_TITLE"], suggestedDelayDays: null };
  }
  const label = clean.replace(/\s+translator$/i, "").trim();
  const tokens = label.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  if (!tokens.length) return { score: 0, decision: "WITHDRAW",
    reasons: ["NO_DESCRIPTIVE_TOPIC"], suggestedDelayDays: null };
  let score = 50;
  const reasons: string[] = [];
  if (tokens.length >= 2 && tokens.length <= 4) {
    score += 14; reasons.push("SCANNABLE_TOPIC");
  } else if (tokens.length === 1) {
    score -= 13; reasons.push("INSUFFICIENT_CONTEXT");
  } else if (tokens.length >= 7) {
    score -= 26; reasons.push("OVERLY_LONG_TOPIC");
  } else {
    score += 1;
  }
  if (tokens.some(word => STYLES.has(word))) {
    score += 18; reasons.push("RECOGNIZABLE_STYLE");
  }
  if (tokens.some(word => RELEVANT.has(word))) {
    score += 10; reasons.push("CLEAR_LANGUAGE_INTENT");
  }
  if (tokens.every(word => VAGUE.has(word))) {
    score -= 24; reasons.push("VAGUE_INTENT");
  }
  if (new Set(tokens).size < tokens.length) {
    score -= 18; reasons.push("REPEATED_WORDS");
  }
  if (label.length > 47) {
    score -= 15; reasons.push("TITLE_TOO_LONG_FOR_PIN");
  }
  if (NOISY.test(label) || /[^a-zA-Z0-9 '\-]/.test(label)) {
    score -= 24; reasons.push("LOW_EDITORIAL_CLARITY");
  }
  // A lone personal or invented name has no verifiable style intent.
  if (tokens.length === 1 && !STYLES.has(tokens[0]) && !RELEVANT.has(tokens[0])) {
    score -= 12; reasons.push("AMBIGUOUS_NAMED_TOPIC");
  }
  const rounded = Math.max(0, Math.min(100, score));
  const decision: SourceRatingDecision =
    rounded >= SOURCE_PRIORITY_THRESHOLD ? "PRIORITY" :
    rounded >= SOURCE_DEFER_THRESHOLD ? "SCHEDULE_LATER" : "WITHDRAW";
  return { score: rounded, decision,
    reasons: reasons.length ? reasons : ["BASIC_EDITORIAL_FIT"],
    suggestedDelayDays: decision === "SCHEDULE_LATER" ? 2 : null };
}

export type RatedSourceConcept = {
  id: string; title: string; sourceUrl: string;
  rating: SourceRating; rank: number;
};

/** Give similar titles one first-choice candidate and defer the rest. */
export function rankSourceTranslators<T extends {
  id: string; title: string; sourceUrl: string;
}>(concepts: readonly T[]): Array<T & { rating: SourceRating; rank: number }> {
  const scored = concepts.map(concept => ({
    ...concept, rating: rateSourceTranslator(concept.title, concept.sourceUrl),
  })).sort((a,b) =>
    b.rating.score - a.rating.score ||
    a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
  const seenFamilies = new Set<string>();
  let deferred = 0;
  return scored.map((item, index) => {
    // Remove generic connective words to identify near-identical variants.
    const family = item.title.toLowerCase().replace(/\s+translator$/i, "")
      .match(/[a-z0-9]+/g)?.filter(word =>
        !["the", "in", "of", "a", "an", "language", "english", "meme"].includes(word))
      .sort().join(" ") || "";
    let rating = item.rating;
    if (family && seenFamilies.has(family) && rating.decision !== "WITHDRAW") {
      const score = Math.min(rating.score, SOURCE_PRIORITY_THRESHOLD - 1);
      rating = { ...rating, score, decision: score >= SOURCE_DEFER_THRESHOLD
        ? "SCHEDULE_LATER" : "WITHDRAW",
        reasons: [...rating.reasons, "SIMILAR_TOPIC_ALREADY_RANKED"],
        suggestedDelayDays: score >= SOURCE_DEFER_THRESHOLD ? 2 : null };
    }
    if (family) seenFamilies.add(family);
    if (rating.decision === "SCHEDULE_LATER") {
      rating = { ...rating, suggestedDelayDays: Math.min(30, 2 + deferred++) };
    }
    return { ...item, rating, rank: index + 1 };
  });
}
