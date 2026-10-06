import type { GrowthPinterestPublicationRole } from "@prisma/client";

export const MAX_CLUSTER_DOCUMENT_FREQUENCY_RATIO = 0.6;
export const MIN_CORPUS_FOR_FREQUENCY_FILTER = 10;
export const GENERIC_CLUSTER_TOKENS = new Set([
  "a",
  "an",
  "and",
  "are",
  "at",
  "be",
  "by",
  "com",
  "for",
  "from",
  "generated",
  "how",
  "idea",
  "ideas",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "pin",
  "pins",
  "pinterest",
  "saytwist",
  "style",
  "styles",
  "text",
  "texts",
  "the",
  "this",
  "to",
  "translate",
  "translation",
  "translator",
  "translators",
  "with",
  "www",
  "your",
]);
export interface ClusterPinInput {
  id: string;
  pinterestPinId: string;
  title: string | null;
  description: string | null;
  destinationUrl: string | null;
  role: GrowthPinterestPublicationRole | null;
  translator?: {
    id: string;
    slug: string;
    name: string;
    category: string | null;
    primaryCategory: { slug: string; name: string } | null;
  } | null;
}
export interface ClusteredPins {
  key: string;
  name: string;
  role: GrowthPinterestPublicationRole | null;
  pins: Array<
    ClusterPinInput & { destinationPath: string | null; matchTokens: string[] }
  >;
}
type PreparedPin = ClusterPinInput & {
  destinationPath: string | null;
  matchTokens: string[];
  candidateWeights: Map<string, number>;
};
export function destinationPath(value: string | null) {
  if (!value) return null;
  try {
    return new URL(value).pathname.replace(/\/+$/, "") || "/";
  } catch {
    return null;
  }
}
const safeDecode = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};
export function translatorSlugFromUrl(value: string | null) {
  const path = destinationPath(value);
  const match = path?.match(/^\/translators\/([^/?#]+)/i);
  return match ? safeDecode(match[1]).toLowerCase() : null;
}
export function lexicalTokens(value: string) {
  return [
    ...new Set(
      value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .split(/\s+/)
        .filter(
          (token) => token.length >= 3 && !GENERIC_CLUSTER_TOKENS.has(token),
        ),
    ),
  ].sort();
}
function terminalPathTokens(value: string | null) {
  const path = destinationPath(value);
  if (!path) return [];
  const terminal = path.split("/").filter(Boolean).at(-1);
  return terminal ? lexicalTokens(safeDecode(terminal)) : [];
}
function addCandidates(
  target: Map<string, number>,
  tokens: string[],
  weight: number,
  prefix = "",
) {
  for (const token of tokens) {
    const key = prefix ? `${prefix}:${token}` : token;
    target.set(key, Math.max(weight, target.get(key) || 0));
  }
}
function preparePin(pin: ClusterPinInput): PreparedPin {
  const candidates = new Map<string, number>();
  const translatorSlug = translatorSlugFromUrl(pin.destinationUrl);
  const category = pin.translator?.primaryCategory;
  if (category) {
    const categoryTokens = lexicalTokens(`${category.slug} ${category.name}`);
    addCandidates(candidates, categoryTokens, 4, "category");
  }
  if (pin.translator) {
    addCandidates(candidates, lexicalTokens(pin.translator.slug), 3);
    addCandidates(candidates, lexicalTokens(pin.translator.name), 3);
    addCandidates(candidates, lexicalTokens(pin.translator.category || ""), 3);
  } else if (translatorSlug) {
    addCandidates(candidates, lexicalTokens(translatorSlug), 2);
  }
  addCandidates(
    candidates,
    lexicalTokens(`${pin.title || ""} ${pin.description || ""}`),
    1,
  );
  if (!translatorSlug)
    addCandidates(candidates, terminalPathTokens(pin.destinationUrl), 2);
  return {
    ...pin,
    destinationPath: destinationPath(pin.destinationUrl),
    matchTokens: [...candidates.keys()].sort(),
    candidateWeights: candidates,
  };
}
export function clusterPins(inputs: ClusterPinInput[]): ClusteredPins[] {
  const prepared = inputs.map(preparePin);
  const frequency = new Map<string, number>();
  for (const pin of prepared)
    for (const token of pin.matchTokens)
      frequency.set(token, (frequency.get(token) || 0) + 1);
  const allowed = (token: string) => {
    const count = frequency.get(token) || 0;
    if (count < 2) return false;
    if (
      prepared.length >= MIN_CORPUS_FOR_FREQUENCY_FILTER &&
      count / prepared.length > MAX_CLUSTER_DOCUMENT_FREQUENCY_RATIO
    )
      return false;
    const raw = token.replace(/^category:/, "");
    return !GENERIC_CLUSTER_TOKENS.has(raw);
  };
  const groups = new Map<string, PreparedPin[]>();
  for (const pin of prepared) {
    const candidates = pin.matchTokens
      .filter(allowed)
      .sort(
        (a, b) =>
          pin.candidateWeights.get(b)! - pin.candidateWeights.get(a)! ||
          (frequency.get(a) || 0) - (frequency.get(b) || 0) ||
          a.localeCompare(b),
      );
    const key = candidates[0];
    if (!key) continue;
    const members = groups.get(key) || [];
    members.push(pin);
    groups.set(key, members);
  }
  return [...groups.entries()]
    .filter(([, pins]) => pins.length >= 2)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([token, pins]) => ({
      key: token.startsWith("category:") ? token : `topic:${token}`,
      name: token.replace(/^category:/, "").replaceAll("-", " "),
      role: pins.every((pin) => pin.role === pins[0].role)
        ? pins[0].role
        : null,
      pins: pins
        .sort((a, b) => a.pinterestPinId.localeCompare(b.pinterestPinId))
        .map(({ candidateWeights, ...pin }) => {
          void candidateWeights;
          return pin;
        }),
    }));
}
