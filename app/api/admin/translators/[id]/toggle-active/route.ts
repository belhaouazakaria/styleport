import { z } from "zod";

import {
  getTranslatorRequestByCreatedTranslatorId,
  markTranslatorRequestPublished,
  markTranslatorRequestPublishedNotificationSent,
} from "@/lib/data/requests";
import { sendTranslatorPublishedEmail } from "@/lib/email-alerts";
import { getAppBaseUrl } from "@/lib/env";
import { logWarn } from "@/lib/logger";
import { toggleTranslatorActive } from "@/lib/data/translators";
import { adminRouteGuard } from "@/lib/permissions";
import { apiError, apiOk } from "@/lib/api-response";

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

  let publishNotificationSent = false;

  if (translator.isActive) {
    const linkedRequest = await getTranslatorRequestByCreatedTranslatorId(translator.id);

    if (linkedRequest) {
      await markTranslatorRequestPublished(linkedRequest.id);

      if (
        linkedRequest.requesterEmail &&
        linkedRequest.emailVerifiedAt &&
        !linkedRequest.publishedNotificationSentAt
      ) {
        const translatorUrl = new URL(
          `/translators/${translator.slug}`,
          getAppBaseUrl({ requestUrl: request.url }),
        ).toString();
        const emailResult = await sendTranslatorPublishedEmail({
          to: linkedRequest.requesterEmail,
          requestedName: linkedRequest.requestedName,
          translatorName: translator.name,
          translatorUrl,
        });

        if (emailResult.sent) {
          publishNotificationSent = true;
          await markTranslatorRequestPublishedNotificationSent(linkedRequest.id);
        } else {
          logWarn(
            "translator_publish_notification_failed",
            "Translator was activated but publish notification email could not be sent.",
            {
              translatorId: translator.id,
              requestId: linkedRequest.id,
              reason: emailResult.error || "unknown",
            },
          );
        }
      }
    }
  }

  return apiOk({ translator, publishNotificationSent });
}
