import { z } from "zod";

import { toggleTranslatorActive } from "@/lib/data/translators";
import { markTranslatorRequestPublishedByTranslatorId } from "@/lib/data/requests";
import { adminRouteGuard } from "@/lib/permissions";
import { apiError, apiOk } from "@/lib/api-response";
import { maybeSendPublishedNotificationForTranslator } from "@/lib/request-publish-notification";

const schema = z.object({
  active: z.boolean().optional(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  const guard = await adminRouteGuard();
  if (guard) return guard;

  let payload: unknown = {};

  try {
    payload = await request.json();
  } catch {
    // Optional payload.
  }

  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    return apiError(400, "VALIDATION_ERROR", "Invalid toggle payload.");
  }

  const { id } = await context.params;
  const translator = await toggleTranslatorActive(id, parsed.data.active);

  if (!translator) {
    return apiError(404, "NOT_FOUND", "Translator not found.");
  }

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
}
