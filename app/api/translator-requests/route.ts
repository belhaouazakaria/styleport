import { apiError, apiOk } from "@/lib/api-response";
import {
  createPublicTranslatorRequest,
  markTranslatorRequestVerificationEmailSent,
} from "@/lib/data/requests";
import { sendTranslatorRequestVerificationEmail } from "@/lib/email-alerts";
import { getAppBaseUrl } from "@/lib/env";
import { logError, logWarn } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";
import { processVerifiedTranslatorRequest } from "@/lib/request-processing";
import { extractClientIp } from "@/lib/utils";
import { translatorRequestSchema } from "@/lib/validators";

export async function POST(request: Request) {
  const identifier = extractClientIp(request);
  const limit = checkRateLimit(`translator-request:${identifier}`);

  if (!limit.allowed) {
    logWarn("translator_request_rate_limited", "Translator request submission hit rate limit.", {
      identifier,
    });
    return apiError(429, "RATE_LIMITED", "Too many request submissions. Please try again shortly.");
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    logWarn("translator_request_bad_json", "Translator request endpoint received invalid JSON.");
    return apiError(400, "BAD_REQUEST", "Invalid JSON payload.");
  }

  const parsed = translatorRequestSchema.safeParse(payload);
  if (!parsed.success) {
    logWarn("translator_request_validation_failed", "Translator request payload failed validation.");
    return apiError(400, "VALIDATION_ERROR", "Please add a translator name and description.");
  }

  if (parsed.data.honeypot?.trim()) {
    logWarn("translator_request_honeypot_triggered", "Translator request blocked by honeypot.");
    return apiError(403, "FORBIDDEN", "Submission blocked.");
  }

  try {
    const created = await createPublicTranslatorRequest(parsed.data);
    if (!created.verificationRequired) {
      const processing = await processVerifiedTranslatorRequest({
        requestId: created.id,
        requestUrl: request.url,
      });

      if (processing.outcome === "AUTO_PUBLISHED") {
        return apiOk(
          {
            requestId: created.id,
            verificationRequired: false,
            mode: "live",
            translatorSlug: processing.translatorSlug,
          },
          201,
        );
      }

      return apiOk(
        {
          requestId: created.id,
          verificationRequired: false,
          mode: "review",
        },
        201,
      );
    }

    if (!created.verificationToken) {
      logError(
        "translator_request_verification_token_missing",
        "Translator request verification token is missing for a pending verification request.",
        { requestId: created.id },
      );
      return apiError(500, "UPSTREAM_ERROR", "Unable to submit request right now.");
    }

    const verificationUrl = new URL("/api/translator-requests/verify", getAppBaseUrl({ requestUrl: request.url }));
    verificationUrl.searchParams.set("token", created.verificationToken);
    verificationUrl.searchParams.set("requestId", created.id);

    const emailResult = await sendTranslatorRequestVerificationEmail({
      to: created.requesterEmail,
      requestedName: created.requestedName,
      verificationUrl: verificationUrl.toString(),
    });

    if (!emailResult.sent) {
      logError(
        "translator_request_verification_email_failed",
        "Translator request created but verification email could not be sent.",
        {
          requestId: created.id,
          reason: emailResult.error || "unknown",
        },
      );
      return apiError(
        502,
        "UPSTREAM_ERROR",
        "Your idea was received, but we could not send the verification email right now. Please try again in a moment.",
      );
    }

    try {
      await markTranslatorRequestVerificationEmailSent(created.id);
    } catch (error) {
      logWarn("translator_request_mark_sent_failed", "Verification email sent but sentAt update failed.", {
        requestId: created.id,
        error: error instanceof Error ? error.message : "unknown",
      });
    }

    return apiOk(
      {
        requestId: created.id,
        verificationRequired: true,
      },
      201,
    );
  } catch (error) {
    logError("translator_request_create_failed", "Failed to persist translator request.", undefined, error);
    return apiError(500, "UPSTREAM_ERROR", "Unable to submit request right now.");
  }
}
