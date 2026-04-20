import {
  archiveCategory,
  getAdminCategoryById,
  hardDeleteCategory,
  unarchiveCategory,
  updateCategory,
} from "@/lib/data/categories";
import { adminRouteGuard } from "@/lib/permissions";
import { apiError, apiOk } from "@/lib/api-response";
import { categoryUpsertSchema } from "@/lib/validators";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_: Request, context: RouteContext) {
  const guard = await adminRouteGuard();
  if (guard) return guard;

  const { id } = await context.params;
  const category = await getAdminCategoryById(id);

  if (!category) {
    return apiError(404, "NOT_FOUND", "Category not found.");
  }

  return apiOk({ category });
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

  const parsed = categoryUpsertSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(400, "VALIDATION_ERROR", "Please provide valid category fields.");
  }

  const { id } = await context.params;

  try {
    const category = await updateCategory(id, parsed.data);
    return apiOk({ category });
  } catch {
    return apiError(500, "BAD_REQUEST", "Unable to update category right now.");
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
      await hardDeleteCategory(id);
      return apiOk({ deleted: true });
    }

    if (mode === "unarchive") {
      const category = await unarchiveCategory(id);
      return apiOk({ category });
    }

    const category = await archiveCategory(id);
    return apiOk({ category });
  } catch {
    return apiError(500, "BAD_REQUEST", "Unable to process request.");
  }
}
