import { apiError, apiOk } from "@/lib/api-response";
import { pruneOldCreativeDesigns } from "@/lib/growth/creative/retention";
import { isSameOriginMutation } from "@/lib/growth/request-security";
import { adminRouteGuard } from "@/lib/permissions";

export async function POST(request: Request) {
  const guard = await adminRouteGuard();
  if (guard) return guard;
  if (!isSameOriginMutation(request)) {
    return apiError(403, "FORBIDDEN", "Cross-origin Studio cleanup is not allowed.");
  }
  try {
    return apiOk(await pruneOldCreativeDesigns());
  } catch {
    return apiError(500, "UPSTREAM_ERROR", "Studio design cleanup could not be completed.");
  }
}
