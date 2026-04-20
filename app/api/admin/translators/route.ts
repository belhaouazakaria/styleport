import { adminRouteGuard } from "@/lib/permissions";
import { apiError, apiOk } from "@/lib/api-response";
import { listAdminTranslators, createTranslator } from "@/lib/data/translators";
import { adminTranslatorFilterSchema, translatorUpsertSchema } from "@/lib/validators";

export async function GET(request: Request) {
  const guard = await adminRouteGuard();
  if (guard) return guard;

  const { searchParams } = new URL(request.url);
  const parsed = adminTranslatorFilterSchema.safeParse({
    q: searchParams.get("q") || undefined,
    status: searchParams.get("status") || undefined,
    featured: searchParams.get("featured") || undefined,
    category: searchParams.get("category") || undefined,
  });

  if (!parsed.success) {
    return apiError(400, "VALIDATION_ERROR", "Invalid translator filter query.");
  }

  const translators = await listAdminTranslators(parsed.data);
  return apiOk({ translators });
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

  const parsed = translatorUpsertSchema.safeParse(payload);

  if (!parsed.success) {
    return apiError(400, "VALIDATION_ERROR", "Please provide valid translator fields.");
  }

  try {
    const translator = await createTranslator(parsed.data);
    return apiOk({ translator }, 201);
  } catch {
    return apiError(500, "BAD_REQUEST", "Unable to create translator at the moment.");
  }
}
