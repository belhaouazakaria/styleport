import { apiError, apiOk } from "@/lib/api-response";
import { approvePinSchema } from "@/lib/growth/publishing/contracts";
import { approvePinCandidate } from "@/lib/growth/publishing/service";
import { isSameOriginMutation } from "@/lib/growth/request-security";
import { adminRouteGuard, getSessionOrNull } from "@/lib/permissions";

export async function POST(request: Request) {
  const guard = await adminRouteGuard(); if (guard) return guard;
  if (!isSameOriginMutation(request)) return apiError(403, "FORBIDDEN", "Cross-origin Pin approval is not allowed.");
  const session = await getSessionOrNull();
  let body: unknown; try { body = await request.json(); } catch { return apiError(400, "VALIDATION_ERROR", "A valid JSON payload is required."); }
  const parsed = approvePinSchema.safeParse(body);
  if (!parsed.success || !session?.user?.id) return apiError(400, "VALIDATION_ERROR", "Invalid Pin approval request.");
  try { const result = await approvePinCandidate(parsed.data, session.user.id); return apiOk({ approvalId: result.approval.id, publicationId: result.publication?.id, created: result.created }, result.created ? 201 : 200); }
  catch (error) { return apiError(400, "VALIDATION_ERROR", error instanceof Error ? error.message : "Pin approval failed."); }
}
