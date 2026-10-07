import { apiError, apiOk } from "@/lib/api-response";
import { isSameOriginMutation } from "@/lib/growth/request-security";
import { ideaArchiveRequestSchema } from "@/lib/growth/ideas/contracts";
import { archiveIdea } from "@/lib/growth/ideas/service";
import { adminRouteGuard, requireAdmin } from "@/lib/permissions";

interface Context { params: Promise<{ ideaId: string }> }

export async function POST(request: Request, context: Context) {
  const guard = await adminRouteGuard();
  if (guard) return guard;
  if (!isSameOriginMutation(request)) return apiError(403, "FORBIDDEN", "Cross-origin archive requests are not allowed.");
  let payload: unknown;
  try { payload = await request.json(); } catch { return apiError(400, "VALIDATION_ERROR", "A valid JSON payload is required."); }
  const parsed = ideaArchiveRequestSchema.safeParse(payload);
  if (!parsed.success) return apiError(400, "VALIDATION_ERROR", "A valid current checksum is required.");
  const session = await requireAdmin();
  const { ideaId } = await context.params;
  try { return apiOk({ idea: await archiveIdea({ ideaId, expectedCurrentChecksum: parsed.data.expectedCurrentChecksum, actorUserId: session.user.id! }) }); }
  catch (error) { const message = error instanceof Error ? error.message : "Archive failed."; return apiError(message.includes("changed") ? 409 : 400, message.includes("changed") ? "CONFLICT" : "VALIDATION_ERROR", message); }
}

