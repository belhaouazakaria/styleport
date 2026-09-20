import { auth } from "@/auth";
import { adminRouteGuard } from "@/lib/permissions";
import { apiError, apiOk } from "@/lib/api-response";
import { createEditorialJob, getEditorialDraft, publishEditorialDraft, setEditorialDraftStatus, updateEditorialDraftPayload } from "@/lib/translator-editorial-jobs";

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const guard = await adminRouteGuard();
  if (guard) return guard;
  const draft = await getEditorialDraft((await context.params).id);
  return draft ? apiOk({ draft }) : apiError(404, "NOT_FOUND", "Editorial draft not found.");
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const guard = await adminRouteGuard();
  if (guard) return guard;
  const session = await auth();
  const id = (await context.params).id;
  let payload: { action?: string; draft?: unknown };
  try { payload = await request.json(); } catch { return apiError(400, "BAD_REQUEST", "Invalid JSON payload."); }
  const reviewerId = session?.user?.id;
  if (!reviewerId) return apiError(401, "UNAUTHORIZED", "Admin session not found.");
  try {
    if (payload.action === "approve" || payload.action === "discard") {
      await setEditorialDraftStatus(id, payload.action === "approve" ? "APPROVED" : "DISCARDED", reviewerId);
      return apiOk({ draft: await getEditorialDraft(id) });
    }
    if (payload.action === "publish") {
      await publishEditorialDraft(id, reviewerId);
      return apiOk({ draft: await getEditorialDraft(id) });
    }
    if (payload.action === "save") {
      await updateEditorialDraftPayload(id, payload.draft);
      return apiOk({ draft: await getEditorialDraft(id) });
    }
    if (payload.action === "regenerate") {
      const draft = await getEditorialDraft(id);
      if (!draft) return apiError(404, "NOT_FOUND", "Editorial draft not found.");
      await setEditorialDraftStatus(id, "DISCARDED", reviewerId);
      const job = await createEditorialJob({ operation: draft.jobItem.operation, translatorIds: [draft.translator.id], requestedById: reviewerId });
      return apiOk({ job }, 202);
    }
    return apiError(400, "VALIDATION_ERROR", "Choose approve, discard, publish, save, or regenerate.");
  } catch (error) {
    return apiError(409, "CONFLICT", error instanceof Error ? error.message : "Unable to update editorial draft.");
  }
}
