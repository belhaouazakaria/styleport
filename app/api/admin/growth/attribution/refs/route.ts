import { apiError, apiOk } from "@/lib/api-response";
import { issueAttributionRefSchema } from "@/lib/growth/attribution/contracts";
import { issueAttributionRefForPin } from "@/lib/growth/attribution/refs";
import { isSameOriginMutation } from "@/lib/growth/request-security";
import { adminRouteGuard } from "@/lib/permissions";

export async function POST(request: Request) {
  const guard = await adminRouteGuard();
  if (guard) return guard;
  if (!isSameOriginMutation(request)) return apiError(403, "FORBIDDEN", "Cross-origin ref issuance is not allowed.");
  let payload: unknown;
  try { payload = await request.json(); } catch { return apiError(400, "BAD_REQUEST", "Invalid JSON payload."); }
  const parsed = issueAttributionRefSchema.safeParse(payload);
  if (!parsed.success) return apiError(400, "VALIDATION_ERROR", "Please select a valid Pin.");
  try {
    const result = await issueAttributionRefForPin(parsed.data.pinId);
    return apiOk({ publicRef: result.ref.publicRef, url: result.url, created: result.created });
  } catch {
    return apiError(400, "VALIDATION_ERROR", "The Pin must be active, analytics-relevant, and use the canonical SayTwist destination.");
  }
}
