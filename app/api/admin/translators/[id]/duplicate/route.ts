import { duplicateTranslator } from "@/lib/data/translators";
import { adminRouteGuard } from "@/lib/permissions";
import { apiError, apiOk } from "@/lib/api-response";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(_: Request, context: RouteContext) {
  const guard = await adminRouteGuard();
  if (guard) return guard;

  const { id } = await context.params;
  const duplicate = await duplicateTranslator(id);

  if (!duplicate) {
    return apiError(404, "NOT_FOUND", "Translator not found.");
  }

  return apiOk({ translator: duplicate }, 201);
}
