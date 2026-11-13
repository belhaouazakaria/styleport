import { apiError, apiOk } from "@/lib/api-response";
import { isSameOriginMutation } from "@/lib/growth/request-security";
import { offerPinForTelegramReview } from "@/lib/growth/publishing/telegram-pin-review";
import { adminRouteGuard, getSessionOrNull } from "@/lib/permissions";

export async function POST(request: Request) {
  const denied = await adminRouteGuard();
  if (denied) return denied;
  if (!isSameOriginMutation(request)) return apiError(403, "FORBIDDEN", "Cross-origin review request rejected.");
  const session = await getSessionOrNull();
  if (!session?.user?.id) return apiError(401, "UNAUTHORIZED", "Admin session required.");
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body) ||
      Object.keys(body).length !== 1 || typeof body.candidateId !== "string" ||
      body.candidateId.length < 1 || body.candidateId.length > 191) {
    return apiError(400, "VALIDATION_ERROR", "Candidate ID is required.");
  }
  try {
    const result = await offerPinForTelegramReview(body.candidateId, session.user.id);
    return apiOk({ status: result.status });
  } catch {
    // No private Telegram settings or transport errors in browser responses.
    return apiError(409, "PIN_REVIEW_UNAVAILABLE", "Private Telegram review is not available or this Pin has already been offered.");
  }
}
