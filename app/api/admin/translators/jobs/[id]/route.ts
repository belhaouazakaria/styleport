import { adminRouteGuard } from "@/lib/permissions";
import { apiError, apiOk } from "@/lib/api-response";
import { getEditorialJobProgress, retryFailedEditorialJobItems, updateEditorialJobStatus } from "@/lib/translator-editorial-jobs";

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const guard = await adminRouteGuard();
  if (guard) return guard;
  const { id } = await context.params;
  const job = await getEditorialJobProgress(id);
  return job ? apiOk({ job }) : apiError(404, "NOT_FOUND", "Editorial job not found.");
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const guard = await adminRouteGuard();
  if (guard) return guard;
  const { id } = await context.params;
  let payload: { action?: string };
  try { payload = await request.json(); } catch { return apiError(400, "BAD_REQUEST", "Invalid JSON payload."); }
  try {
    if (payload.action === "retry-failed") {
      const count = await retryFailedEditorialJobItems(id);
      return apiOk({ retried: count });
    }
    if (payload.action !== "pause" && payload.action !== "resume" && payload.action !== "cancel") {
      return apiError(400, "VALIDATION_ERROR", "Choose pause, resume, cancel, or retry-failed.");
    }
    await updateEditorialJobStatus(id, payload.action);
    return apiOk({ job: await getEditorialJobProgress(id) });
  } catch (error) {
    return apiError(409, "CONFLICT", error instanceof Error ? error.message : "Unable to update editorial job.");
  }
}
