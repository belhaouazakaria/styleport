import { getAppBaseUrl } from "@/lib/env";

/** Owner-approved destinations only. The legacy host is permitted for Translator
 * paths, never Ideas or arbitrary redirect targets. */
export const PIN_DESTINATION_DOMAINS = ["saytwist.com", "translator.whattypeof.com"] as const;
export type PinDestinationDomain = typeof PIN_DESTINATION_DOMAINS[number];
export const DEFAULT_PIN_DESTINATION_DOMAIN: PinDestinationDomain = "saytwist.com";

export function isPinDestinationDomain(value: unknown): value is PinDestinationDomain {
  return typeof value === "string" &&
    (PIN_DESTINATION_DOMAINS as readonly string[]).includes(value);
}

export function domainForPinPath(
  requested: PinDestinationDomain,
  path: string,
): PinDestinationDomain {
  if (requested === "translator.whattypeof.com" &&
      !/^\/translators\/[a-z0-9]+(?:-[a-z0-9]+)*\/?$/.test(path)) {
    // An Ideas page has no legacy equivalent. Do not produce a broken link.
    return DEFAULT_PIN_DESTINATION_DOMAIN;
  }
  return requested;
}

export function pinDestinationUrl(
  canonicalUrl: string,
  requested: PinDestinationDomain,
  baseUrl = getAppBaseUrl(),
) {
  const parsed = new URL(canonicalUrl);
  if (parsed.origin !== baseUrl.origin || parsed.protocol !== "https:" ||
      parsed.username || parsed.password || parsed.hash) {
    throw Error("PIN_DESTINATION_CANONICAL_URL_REQUIRED");
  }
  const target = domainForPinPath(requested, parsed.pathname);
  if (target === DEFAULT_PIN_DESTINATION_DOMAIN) return parsed.toString();
  parsed.hostname = target;
  return parsed.toString();
}
