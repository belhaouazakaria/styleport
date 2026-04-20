import { adminRouteGuard } from "@/lib/permissions";
import { apiError, apiOk } from "@/lib/api-response";
import { categoryUpsertSchema } from "@/lib/validators";
import { createCategory, listAdminCategories } from "@/lib/data/categories";

export async function GET() {
  const guard = await adminRouteGuard();
  if (guard) return guard;

  const categories = await listAdminCategories();
  return apiOk({ categories });
}

export async function POST(request: Request) {
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

  try {
    const category = await createCategory(parsed.data);
    return apiOk({ category }, 201);
  } catch {
    return apiError(500, "BAD_REQUEST", "Unable to create category right now.");
  }
}
