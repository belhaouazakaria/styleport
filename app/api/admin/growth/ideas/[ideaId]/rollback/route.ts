import { apiError, apiOk } from "@/lib/api-response";
import { isSameOriginMutation } from "@/lib/growth/request-security";
import { ideaRollbackRequestSchema } from "@/lib/growth/ideas/contracts";
import { IdeaRollbackValidationError, rollbackIdeaVersion } from "@/lib/growth/ideas/service";
import { adminRouteGuard, requireAdmin } from "@/lib/permissions";

interface Context { params: Promise<{ ideaId: string }> }

export async function POST(request: Request, context: Context) {
  const guard = await adminRouteGuard();
  if (guard) return guard;
  if (!isSameOriginMutation(request)) return apiError(403, "FORBIDDEN", "Cross-origin rollback requests are not allowed.");
  let payload: unknown;
  try { payload = await request.json(); } catch { return apiError(400, "VALIDATION_ERROR", "A valid JSON payload is required."); }
  const parsed = ideaRollbackRequestSchema.safeParse(payload);
  if (!parsed.success) return apiError(400, "VALIDATION_ERROR", "A valid rollback payload is required.");
  const session = await requireAdmin();
  const { ideaId } = await context.params;
  try { return apiOk(await rollbackIdeaVersion({ ideaId, ...parsed.data, actorUserId: session.user.id! })); }
  catch (error) {
    if (error instanceof IdeaRollbackValidationError) return apiError(409, "CONFLICT", "Stored version is no longer safe to restore.", error.diagnostics);
    const message = error instanceof Error ? error.message : "Rollback failed.";
    return apiError(message.includes("changed") ? 409 : message.includes("belong") ? 404 : 400, message.includes("changed") ? "CONFLICT" : message.includes("belong") ? "NOT_FOUND" : "VALIDATION_ERROR", message);
  }
}

