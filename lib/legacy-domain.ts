import { headers } from "next/headers";

// Public host matching must be exact. Do not trust forwarded-host headers
// supplied by an arbitrary client, or infer the hostname from a redirect.
export const LEGACY_TRANSLATOR_HOSTNAME = "translator.whattypeof.com";

export function isLegacyTranslatorHostname(host: string | null | undefined): boolean {
  if (!host) return false;
  return host.trim().toLowerCase().replace(/:443$/, "") === LEGACY_TRANSLATOR_HOSTNAME;
}

/**
 * Never reuse the main site's ad snippets or inventory on the legacy hostname
 * until the owner has confirmed the legacy site's AdSense status and ad tags.
 * This is deliberately independent of SayTwist's existing global adsEnabled.
 */
export function advertisingPermittedForHost(
  host: string | null | undefined,
  approval: string | undefined = process.env.LEGACY_TRANSLATOR_ADS_APPROVED,
): boolean {
  return !isLegacyTranslatorHostname(host) || approval === "true";
}

export async function advertisingPermittedForCurrentHost(): Promise<boolean> {
  const requestHeaders = await headers();
  return advertisingPermittedForHost(requestHeaders.get("host"));
}
