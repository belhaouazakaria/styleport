import {
  getTranslatorRequestByCreatedTranslatorId,
  markTranslatorRequestPublishedNotificationSent,
} from "@/lib/data/requests";
import { TranslatorRequestStatus } from "@prisma/client";
import { sendTranslatorPublishedEmail } from "@/lib/email-alerts";
import { getAppBaseUrl } from "@/lib/env";
import { logWarn } from "@/lib/logger";

interface MaybeSendPublishedNotificationInput {
  translator: {
    id: string;
    name: string;
    slug: string;
    isActive: boolean;
  };
  requestUrl?: string;
}

interface MaybeSendPublishedNotificationResult {
  publishNotificationSent: boolean;
}

export async function maybeSendPublishedNotificationForTranslator(
  input: MaybeSendPublishedNotificationInput,
): Promise<MaybeSendPublishedNotificationResult> {
  if (!input.translator.isActive) {
    return { publishNotificationSent: false };
  }

  const linkedRequest = await getTranslatorRequestByCreatedTranslatorId(input.translator.id);
  if (!linkedRequest) {
    return { publishNotificationSent: false };
  }

  if (
    linkedRequest.status !== TranslatorRequestStatus.PUBLISHED ||
    !linkedRequest.requesterEmail ||
    !linkedRequest.emailVerifiedAt ||
    linkedRequest.publishedNotificationSentAt
  ) {
    return { publishNotificationSent: false };
  }

  const translatorUrl = new URL(
    `/translators/${input.translator.slug}`,
    getAppBaseUrl({ requestUrl: input.requestUrl }),
  ).toString();

  const emailResult = await sendTranslatorPublishedEmail({
    to: linkedRequest.requesterEmail,
    requestedName: linkedRequest.requestedName,
    translatorName: input.translator.name,
    translatorUrl,
  });

  if (!emailResult.sent) {
    logWarn(
      "translator_publish_notification_failed",
      "Translator is live but publish notification email could not be sent.",
      {
        translatorId: input.translator.id,
        requestId: linkedRequest.id,
        reason: emailResult.error || "unknown",
      },
    );
    return { publishNotificationSent: false };
  }

  await markTranslatorRequestPublishedNotificationSent(linkedRequest.id);
  return { publishNotificationSent: true };
}
