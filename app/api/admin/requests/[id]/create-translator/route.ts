import { adminRouteGuard } from "@/lib/permissions";
import { apiError, apiOk } from "@/lib/api-response";
import { buildTranslatorFromRequest, toApiErrorResponse } from "@/lib/request-processing";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  const guard = await adminRouteGuard();
  if (guard) return guard;

  const { id } = await context.params;

  try {
    const built = await buildTranslatorFromRequest({
      requestId: id,
      requestUrl: request.url,
      activateTranslator: false,
    });
    return apiOk({ translator: built.translator, publishNotificationSent: built.publishNotificationSent }, 201);
  } catch (error) {
    const mapped = toApiErrorResponse(error);
    return apiError(mapped.status, mapped.code, mapped.message);
  }
}
