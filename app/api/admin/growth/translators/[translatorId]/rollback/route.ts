import { apiError, apiOk } from "@/lib/api-response";
import { isSameOriginMutation } from "@/lib/growth/request-security";
import { translatorRollbackRequestSchema } from "@/lib/growth/translator/contracts";
import { RollbackValidationError, rollbackTranslatorVersion } from "@/lib/growth/translator/service";
import { adminRouteGuard, requireAdmin } from "@/lib/permissions";

interface RouteContext { params: Promise<{ translatorId: string }> }

export async function POST(request: Request, context: RouteContext) {
  const guard = await adminRouteGuard();
  if (guard) return guard;
  if (!isSameOriginMutation(request)) return apiError(403, "FORBIDDEN", "Cross-origin rollback requests are not allowed.");
  let payload: unknown;
  try { payload = await request.json(); } catch { return apiError(400, "VALIDATION_ERROR", "A valid JSON payload is required."); }
  const parsed = translatorRollbackRequestSchema.safeParse(payload);
  if (!parsed.success) return apiError(400, "VALIDATION_ERROR", "A valid targetVersionId is required.");
  const { translatorId } = await context.params;
  const session = await requireAdmin();
  try {
    const result = await rollbackTranslatorVersion({ translatorId, targetVersionId: parsed.data.targetVersionId, expectedCurrentChecksum: parsed.data.expectedCurrentChecksum, actorUserId: session.user.id || null });
    return apiOk(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Rollback failed.";
    if (error instanceof RollbackValidationError) return apiError(409, "CONFLICT", "Stored version is no longer safe to restore.", error.diagnostics);
    const status = message.includes("does not belong") || message.includes("does not exist") ? 404 : message.includes("changed") ? 409 : 400;
    return apiError(status, status === 409 ? "CONFLICT" : status === 404 ? "NOT_FOUND" : "VALIDATION_ERROR", message);
  }
}
