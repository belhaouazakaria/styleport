import { apiError, apiOk } from "@/lib/api-response";
import { approvePinSchema } from "@/lib/growth/publishing/contracts";
import { approvePinCandidate, approvePinCandidateAutomatically } from "@/lib/growth/publishing/service";
import { isSameOriginMutation } from "@/lib/growth/request-security";
import { adminRouteGuard, getSessionOrNull } from "@/lib/permissions";

export async function POST(request: Request) {
  const guard = await adminRouteGuard(); if (guard) return guard;
  if (!isSameOriginMutation(request)) return apiError(403, "FORBIDDEN", "Cross-origin Pin approval is not allowed.");
  const session = await getSessionOrNull();
  let body: unknown; try { body = await request.json(); } catch { return apiError(400, "VALIDATION_ERROR", "A valid JSON payload is required."); }
  if (!session?.user?.id) return apiError(401, "UNAUTHORIZED", "Authentication required.");
  const auto = body && typeof body === "object" && !Array.isArray(body) && (body as Record<string, unknown>).mode === "AUTO";
  const parsed = approvePinSchema.safeParse(body);
  if (!auto && !parsed.success) return apiError(400, "VALIDATION_ERROR", "Invalid Pin approval request.");
  try {
    const input = body as Record<string, unknown>;
    if (auto && (typeof input.candidateId !== "string" || input.candidateId.length < 1 || input.candidateId.length > 191 || input.confirmation !== true ||
        Object.keys(input).some(key => !["mode", "candidateId", "confirmation", "destinationDomain"].includes(key)) ||
        (input.destinationDomain !== undefined && !["saytwist.com", "translator.whattypeof.com"].includes(String(input.destinationDomain))))) {
      return apiError(400, "VALIDATION_ERROR", "Invalid automatic Pin approval request.");
    }
    const result = auto
      ? await approvePinCandidateAutomatically(input.candidateId as string, session.user.id, input.destinationDomain as "saytwist.com" | "translator.whattypeof.com" | undefined)
      : await approvePinCandidate(approvePinSchema.parse(body), session.user.id);
    return apiOk({ approvalId: result.approval.id, publicationId: result.publication?.id, created: result.created }, result.created ? 201 : 200);
  }
  catch (error) { return apiError(400, "VALIDATION_ERROR", error instanceof Error ? error.message : "Pin approval failed."); }
}
