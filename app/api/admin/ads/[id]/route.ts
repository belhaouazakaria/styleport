import {
  archiveAdPlacement,
  getAdById,
  hardDeleteAdPlacement,
  unarchiveAdPlacement,
  updateAdPlacement,
} from "@/lib/data/ads";
import { adminRouteGuard } from "@/lib/permissions";
import { apiError, apiOk } from "@/lib/api-response";
import { adPlacementUpsertSchema } from "@/lib/validators";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_: Request, context: RouteContext) {
  const guard = await adminRouteGuard();
  if (guard) return guard;

  const { id } = await context.params;
  const ad = await getAdById(id);

  if (!ad) {
    return apiError(404, "NOT_FOUND", "Ad placement not found.");
  }

  return apiOk({ ad });
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

  const parsed = adPlacementUpsertSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(400, "VALIDATION_ERROR", "Please provide valid ad placement fields.");
  }

  const { id } = await context.params;

  try {
    const ad = await updateAdPlacement(id, parsed.data);
    return apiOk({ ad });
  } catch {
    return apiError(500, "BAD_REQUEST", "Unable to update ad placement right now.");
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const guard = await adminRouteGuard();
  if (guard) return guard;

  const { id } = await context.params;
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("mode") || "archive";

  try {
    if (mode === "hard") {
      await hardDeleteAdPlacement(id);
      return apiOk({ deleted: true });
    }

    if (mode === "unarchive") {
      const ad = await unarchiveAdPlacement(id);
      return apiOk({ ad });
    }

    const ad = await archiveAdPlacement(id);
    return apiOk({ ad });
  } catch {
    return apiError(500, "BAD_REQUEST", "Unable to process request.");
  }
}
