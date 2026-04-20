import { apiError, apiOk } from "@/lib/api-response";
import { getAdminTranslatorRequestById, updateTranslatorRequestById } from "@/lib/data/requests";
import { adminRouteGuard } from "@/lib/permissions";
import { requestStatusUpdateSchema } from "@/lib/validators";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_: Request, context: RouteContext) {
  const guard = await adminRouteGuard();
  if (guard) return guard;

  const { id } = await context.params;
  const request = await getAdminTranslatorRequestById(id);

  if (!request) {
    return apiError(404, "NOT_FOUND", "Request not found.");
  }

  return apiOk({ request });
}

export async function PATCH(request: Request, context: RouteContext) {
  const guard = await adminRouteGuard();
  if (guard) return guard;

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return apiError(400, "BAD_REQUEST", "Invalid JSON payload.");
  }

  const parsed = requestStatusUpdateSchema.safeParse(payload);

  if (!parsed.success) {
    return apiError(400, "VALIDATION_ERROR", "Please provide valid request updates.");
  }

  const { id } = await context.params;

  try {
    const updated = await updateTranslatorRequestById(id, {
      status: parsed.data.status,
      adminNotes: parsed.data.adminNotes,
    });
    return apiOk({ request: updated });
  } catch {
    return apiError(500, "BAD_REQUEST", "Unable to update request right now.");
  }
}
