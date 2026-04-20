import { adminRouteGuard } from "@/lib/permissions";
import { apiError, apiOk } from "@/lib/api-response";
import { adPlacementUpsertSchema } from "@/lib/validators";
import { createAdPlacement, listAdminAds } from "@/lib/data/ads";

export async function GET() {
  const guard = await adminRouteGuard();
  if (guard) return guard;

  const ads = await listAdminAds();
  return apiOk({ ads });
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

  const parsed = adPlacementUpsertSchema.safeParse(payload);

  if (!parsed.success) {
    return apiError(400, "VALIDATION_ERROR", "Please provide valid ad placement fields.");
  }

  try {
    const ad = await createAdPlacement(parsed.data);
    return apiOk({ ad }, 201);
  } catch {
    return apiError(500, "BAD_REQUEST", "Unable to create ad placement right now.");
  }
}
