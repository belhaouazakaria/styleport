import type { GrowthPinterestPublicationRole } from "@prisma/client";
const STOP = new Set([
  "a",
  "an",
  "and",
  "are",
  "at",
  "be",
  "by",
  "for",
  "from",
  "how",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "saytwist",
  "text",
  "the",
  "this",
  "to",
  "translator",
  "translate",
  "translation",
  "with",
  "your",
  "pin",
  "pinterest",
  "www",
  "com",
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
export function destinationPath(value: string | null) {
  if (!value) return null;
  try {
    return new URL(value).pathname.replace(/\/+$/, "") || "/";
  } catch {
    return null;
  }
}
export function translatorSlugFromUrl(value: string | null) {
  const path = destinationPath(value);
  const match = path?.match(/^\/translators\/([^/?#]+)/i);
  return match ? decodeURIComponent(match[1]).toLowerCase() : null;
}
export function lexicalTokens(value: string) {
  return [
    ...new Set(
      value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .split(/\s+/)
        .filter((x) => x.length >= 3 && !STOP.has(x)),
    ),
  ].sort();
}
export function clusterPins(inputs: ClusterPinInput[]): ClusteredPins[] {
  const prepared = inputs.map((pin) => {
    const category = pin.translator?.primaryCategory;
    const preferred = category
      ? [`category:${category.slug}`, ...lexicalTokens(category.name)]
      : [];
    const tokens = [
      ...new Set([
        ...preferred,
        ...lexicalTokens(
          [
            pin.translator?.category,
            pin.translator?.name,
            pin.title,
            pin.description,
            destinationPath(pin.destinationUrl),
          ]
            .filter(Boolean)
            .join(" "),
        ),
      ]),
    ].sort();
    return {
      ...pin,
      destinationPath: destinationPath(pin.destinationUrl),
      matchTokens: tokens,
    };
  });
  const frequency = new Map<string, number>();
  for (const pin of prepared)
    for (const token of pin.matchTokens)
      frequency.set(token, (frequency.get(token) || 0) + 1);
  const groups = new Map<string, typeof prepared>();
  for (const pin of prepared) {
    const candidates = pin.matchTokens
      .filter((token) => (frequency.get(token) || 0) >= 2)
      .sort(
        (a, b) => frequency.get(b)! - frequency.get(a)! || a.localeCompare(b),
      );
    const key = candidates[0];
    if (!key) continue;
    const members = groups.get(key) || [];
    members.push(pin);
    groups.set(key, members);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([token, pins]) => ({
      key: token.startsWith("category:") ? token : `topic:${token}`,
      name: token.replace(/^category:/, "").replaceAll("-", " "),
      role: pins.every((p) => p.role === pins[0].role) ? pins[0].role : null,
      pins: pins.sort((a, b) =>
        a.pinterestPinId.localeCompare(b.pinterestPinId),
      ),
    }));
}
