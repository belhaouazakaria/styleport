import { apiError, apiOk } from "@/lib/api-response";
import { getAttributionCollectionStatus } from "@/lib/growth/attribution/config";
import { attributionClientEventSchema } from "@/lib/growth/attribution/contracts";
import { recordClientAttributionEvent } from "@/lib/growth/attribution/sessions";
import { attributionRequestAllowed, readBoundedJson } from "@/lib/growth/attribution/traffic";

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
  const parsed = attributionClientEventSchema.safeParse(payload);
  if (!parsed.success) return apiError(400, "VALIDATION_ERROR", "Invalid attribution event.");
  const result = await recordClientAttributionEvent({
    request,
    type: parsed.data.type,
    translatorSlug: parsed.data.translatorSlug,
    clientEventKey: parsed.data.eventKey,
  });
  return apiOk({ collected: result.collected });
}
