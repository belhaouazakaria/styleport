import { apiError, apiOk } from "@/lib/api-response";
import { rejectPinSchema } from "@/lib/growth/publishing/contracts";
import { rejectPinCandidate } from "@/lib/growth/publishing/service";
import { isSameOriginMutation } from "@/lib/growth/request-security";
import { adminRouteGuard, getSessionOrNull } from "@/lib/permissions";

export async function POST(request: Request) {
  const guard = await adminRouteGuard(); if (guard) return guard;
  if (!isSameOriginMutation(request)) return apiError(403, "FORBIDDEN", "Cross-origin Pin rejection is not allowed.");
  const session = await getSessionOrNull();
  let body: unknown; try { body = await request.json(); } catch { return apiError(400, "VALIDATION_ERROR", "A valid JSON payload is required."); }
  const parsed = rejectPinSchema.safeParse(body);
  if (!parsed.success || !session?.user?.id) return apiError(400, "VALIDATION_ERROR", "Invalid Pin rejection request.");
  try { const result = await rejectPinCandidate(parsed.data, session.user.id); return apiOk({ approvalId: result.id }, 201); }
  catch (error) { return apiError(400, "VALIDATION_ERROR", error instanceof Error ? error.message : "Pin rejection failed."); }
}
