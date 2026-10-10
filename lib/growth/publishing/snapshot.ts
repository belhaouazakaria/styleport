import { createHash } from "node:crypto";
import { getAppBaseUrl } from "@/lib/env";

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
  if (actual.origin !== baseUrl.origin || expected.origin !== baseUrl.origin || actual.pathname !== expected.pathname) return false;
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
