import {
  archiveTranslator,
  getAdminTranslatorById,
  hardDeleteTranslator,
  unarchiveTranslator,
  updateTranslator,
} from "@/lib/data/translators";
import { markTranslatorRequestPublishedByTranslatorId } from "@/lib/data/requests";
import { adminRouteGuard } from "@/lib/permissions";
import { apiError, apiOk } from "@/lib/api-response";
import { translatorUpsertSchema } from "@/lib/validators";
import { maybeSendPublishedNotificationForTranslator } from "@/lib/request-publish-notification";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_: Request, context: RouteContext) {
  const guard = await adminRouteGuard();
  if (guard) return guard;

  const { id } = await context.params;
  const translator = await getAdminTranslatorById(id);

  if (!translator) {
    return apiError(404, "NOT_FOUND", "Translator not found.");
  }

  return apiOk({ translator });
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

  const parsed = translatorUpsertSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(400, "VALIDATION_ERROR", "Please provide valid translator fields.");
  }

  const { id } = await context.params;

  try {
    const translator = await updateTranslator(id, parsed.data);
    if (translator.isActive) {
      await markTranslatorRequestPublishedByTranslatorId(translator.id);
    }
    const notification = await maybeSendPublishedNotificationForTranslator({
      translator: {
        id: translator.id,
        name: translator.name,
        slug: translator.slug,
        isActive: translator.isActive,
      },
      requestUrl: request.url,
    });
    return apiOk({ translator, publishNotificationSent: notification.publishNotificationSent });
  } catch {
    return apiError(500, "BAD_REQUEST", "Unable to update translator right now.");
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
      await hardDeleteTranslator(id);
      return apiOk({ deleted: true });
    }

    if (mode === "unarchive") {
      const translator = await unarchiveTranslator(id);
      return apiOk({ translator });
    }

    const translator = await archiveTranslator(id);
    return apiOk({ translator });
  } catch {
    return apiError(500, "BAD_REQUEST", "Unable to process delete request.");
  }
}
