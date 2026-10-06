import { apiError, apiOk } from "@/lib/api-response";
import { getAttributionCollectionStatus } from "@/lib/growth/attribution/config";
import { attributionLandingSchema } from "@/lib/growth/attribution/contracts";
import { findActiveAttributionRef } from "@/lib/growth/attribution/refs";
import { attributionCookieOptions, recordQualifiedPinterestLanding } from "@/lib/growth/attribution/sessions";
import { attributionRequestAllowed, readBoundedJson } from "@/lib/growth/attribution/traffic";
import { ATTRIBUTION_COOKIE_NAME } from "@/lib/growth/attribution/constants";

export async function POST(request: Request) {
  const collection = await getAttributionCollectionStatus();
  if (!collection.enabled) return apiOk({ collected: false, state: collection.state });
  if (!attributionRequestAllowed(request)) return apiOk({ collected: false });

  let payload: unknown;
  try {
    payload = await readBoundedJson(request);
  } catch {
    return apiError(400, "BAD_REQUEST", "Invalid attribution request.");
  }
  const parsed = attributionLandingSchema.safeParse(payload);
  if (!parsed.success) return apiError(400, "VALIDATION_ERROR", "Invalid attribution landing.");

  const ref = await findActiveAttributionRef(parsed.data.pinRef);
  if (!ref) return apiOk({ collected: false });
  const result = await recordQualifiedPinterestLanding({
    request,
    ref,
    destinationPath: parsed.data.destinationPath,
    utmCampaign: parsed.data.utmCampaign,
    utmContent: parsed.data.utmContent,
    clientEventKey: parsed.data.eventKey,
  });
  if (!result.collected) return apiOk({ collected: false });

  const response = apiOk({ collected: true });
  response.cookies.set(ATTRIBUTION_COOKIE_NAME, result.token, attributionCookieOptions(result.settings));
  return response;
}
