import { adminRouteGuard } from "@/lib/permissions";
import { apiError, apiOk } from "@/lib/api-response";
import { submitAllActiveTranslatorsToGoogleIndexing } from "@/lib/data/indexing";

export async function POST(request: Request) {
  const guard = await adminRouteGuard();
  if (guard) return guard;

  try {
    const result = await submitAllActiveTranslatorsToGoogleIndexing({ requestUrl: request.url });
    return apiOk(result);
  } catch {
    return apiError(500, "UPSTREAM_ERROR", "Unable to submit active translators to Google Indexing API.");
  }
}
