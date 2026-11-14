import { createHash } from "node:crypto";
import { getAppBaseUrl } from "@/lib/env";
import { domainForPinPath, isPinDestinationDomain, pinDestinationUrl } from "@/lib/growth/publishing/destinations";

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  return JSON.stringify(value);
}
export function pinApprovalSnapshotChecksum(snapshot: unknown) { return createHash("sha256").update(canonical(snapshot)).digest("hex"); }
export function buildPublicCreativeAssetUrl(publicPath: string, baseUrl = getAppBaseUrl()) {
  if (!/^\/generated\/growth-creatives\/creative-[a-f0-9]{64}\.png$/.test(publicPath)) throw new Error("Creative asset path is not publishable.");
  const url = new URL(publicPath, baseUrl);
  if (url.origin !== baseUrl.origin || (process.env.NODE_ENV === "production" && url.protocol !== "https:")) throw new Error("Creative asset URL must use the canonical HTTPS SayTwist origin.");
  return url.toString();
}

/**
 * Rebuild the destination using the specific hostname bound to a previously
 * checksum-verified Pin approval. There is no fallback to a different host:
 * the exact approved URL, tracking query, and route must still match.
 *
 * Callers MUST verify pinApprovalSnapshotChecksum(storedSnapshot) before
 * passing storedSnapshot.destinationUrl to this function.
 */
export function rebuildApprovedPinDestinationUrl(
  canonicalDestinationUrl: string,
  approvedDestinationUrl: unknown,
  baseUrl = getAppBaseUrl(),
): string | null {
  if (typeof approvedDestinationUrl !== "string") return null;
  try {
    const approved = new URL(approvedDestinationUrl);
    if (approved.protocol !== "https:" || approved.username || approved.password ||
        approved.hash || approved.port || !isPinDestinationDomain(approved.hostname) ||
        domainForPinPath(approved.hostname, approved.pathname) !== approved.hostname) {
      return null;
    }
    const rebuilt = pinDestinationUrl(canonicalDestinationUrl, approved.hostname, baseUrl);
    return rebuilt === approvedDestinationUrl ? rebuilt : null;
  } catch {
    return null;
  }
}

function sortedQueryEntries(url: URL) {
  return [...url.searchParams.entries()].sort(([leftKey, leftValue], [rightKey, rightValue]) =>
    leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue));
}

export function pinterestPublicationUrlsMatch(actualValue: string, expectedValue: string, baseUrl = getAppBaseUrl()) {
  let actual: URL;
  let expected: URL;
  try {
    actual = new URL(actualValue);
    expected = new URL(expectedValue);
  } catch {
    return false;
  }
  if (actual.username || actual.password || actual.hash || expected.username || expected.password || expected.hash) return false;
  const canonical = baseUrl.origin;
  const legacy = "https://translator.whattypeof.com";
  // The exact chosen hostname is bound in the immutable approval snapshot.
  // The legacy origin is valid only for an actual Translator route.
  if (![canonical, legacy].includes(expected.origin) || actual.origin !== expected.origin ||
      (expected.origin === legacy && !/^\/translators\/[a-z0-9]+(?:-[a-z0-9]+)*\/?$/.test(expected.pathname)) ||
      actual.pathname !== expected.pathname) return false;
  if (expected.searchParams.get("utm_source") !== "pinterest" || expected.searchParams.get("utm_medium") !== "organic") return false;
  for (const key of ["utm_campaign", "utm_content", "pin_ref"] as const) {
    const expectedValueForKey = expected.searchParams.get(key);
    if (!expectedValueForKey || actual.searchParams.get(key) !== expectedValueForKey) return false;
  }
  const actualEntries = sortedQueryEntries(actual);
  const expectedEntries = sortedQueryEntries(expected);
  return actualEntries.length === expectedEntries.length
    && actualEntries.every(([key, value], index) => key === expectedEntries[index][0] && value === expectedEntries[index][1]);
}
