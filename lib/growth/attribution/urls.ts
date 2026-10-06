import type { GrowthAttributionRef } from "@prisma/client";

import { getAppBaseUrl } from "@/lib/env";

const ATTRIBUTION_QUERY_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "pin_ref",
];
const LEGACY_SAYTWIST_DESTINATION_HOSTS = new Set([
  "translator.whattypeof.com",
]);

export function normalizeAttributionDestinationPath(
  value: string,
  baseUrl = getAppBaseUrl(),
) {
  if (
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\")
  ) {
    throw new Error(
      "Attribution destination must be a same-origin absolute path.",
    );
  }
  const destination = new URL(value, baseUrl);
  if (
    destination.origin !== baseUrl.origin ||
    destination.username ||
    destination.password ||
    destination.hash
  ) {
    throw new Error(
      "Attribution destination must remain on the canonical SayTwist origin.",
    );
  }
  for (const key of ATTRIBUTION_QUERY_KEYS)
    destination.searchParams.delete(key);
  return `${destination.pathname}${destination.search}`;
}

export function destinationPathFromUrl(
  value: string,
  baseUrl = getAppBaseUrl(),
) {
  const parsed = new URL(value);
  const isCanonicalOrigin = parsed.origin === baseUrl.origin;
  const isApprovedLegacyOrigin =
    parsed.protocol === "https:" &&
    !parsed.port &&
    LEGACY_SAYTWIST_DESTINATION_HOSTS.has(parsed.hostname.toLowerCase());
  if (
    (!isCanonicalOrigin && !isApprovedLegacyOrigin) ||
    parsed.username ||
    parsed.password ||
    parsed.hash
  ) {
    throw new Error(
      "Pinterest Pin destination is not on an approved SayTwist origin.",
    );
  }
  return normalizeAttributionDestinationPath(
    `${parsed.pathname}${parsed.search}`,
    baseUrl,
  );
}

export function buildAttributionUrl(
  ref: Pick<
    GrowthAttributionRef,
    "publicRef" | "destinationPath" | "campaignKey" | "contentKey"
  >,
  baseUrl = getAppBaseUrl(),
) {
  const path = normalizeAttributionDestinationPath(
    ref.destinationPath,
    baseUrl,
  );
  const output = new URL(path, baseUrl);
  output.searchParams.set("utm_source", "pinterest");
  output.searchParams.set("utm_medium", "organic");
  output.searchParams.set("utm_campaign", ref.campaignKey);
  output.searchParams.set("utm_content", ref.contentKey);
  output.searchParams.set("pin_ref", ref.publicRef);
  return output.toString();
}

export function destinationMatchesRef(
  requestPath: string,
  refPath: string,
  baseUrl = getAppBaseUrl(),
) {
  try {
    return (
      normalizeAttributionDestinationPath(requestPath, baseUrl) ===
      normalizeAttributionDestinationPath(refPath, baseUrl)
    );
  } catch {
    return false;
  }
}
