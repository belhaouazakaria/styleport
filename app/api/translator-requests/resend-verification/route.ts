import { apiError, apiOk } from "@/lib/api-response";
import {
  markTranslatorRequestVerificationEmailSent,
  resendTranslatorRequestVerificationToken,
} from "@/lib/data/requests";
import { sendTranslatorRequestVerificationEmail } from "@/lib/email-alerts";
import { getAppBaseUrl } from "@/lib/env";
import { logError, logWarn } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";
import { extractClientIp } from "@/lib/utils";
import { translatorRequestResendSchema } from "@/lib/validators";

export async function POST(request: Request) {
  const identifier = extractClientIp(request);
  const limit = checkRateLimit(`translator-request-resend:${identifier}`);

  if (!limit.allowed) {
    return apiError(429, "RATE_LIMITED", "Please wait a moment before requesting another verification email.");
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return apiError(400, "BAD_REQUEST", "Invalid JSON payload.");
  }

  const parsed = translatorRequestResendSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(400, "VALIDATION_ERROR", "Please provide a valid request ID and email.");
  }

  const resend = await resendTranslatorRequestVerificationToken(parsed.data);

  if (resend.outcome === "NOT_FOUND") {
    return apiError(404, "NOT_FOUND", "We could not match that request and email.");
  }

  if (resend.outcome === "ALREADY_VERIFIED") {
    return apiError(409, "CONFLICT", "This email is already verified for that submission.");
  }

  if (resend.outcome === "TOO_MANY_REQUESTS") {
    return apiError(429, "RATE_LIMITED", "A verification email was sent recently. Please try again in a minute.");
  }

  const verificationUrl = new URL("/api/translator-requests/verify", getAppBaseUrl({ requestUrl: request.url }));
  verificationUrl.searchParams.set("token", resend.verificationToken);
  verificationUrl.searchParams.set("requestId", resend.requestId);

  const emailResult = await sendTranslatorRequestVerificationEmail({
    to: resend.requesterEmail,
    requestedName: resend.requestedName,
    verificationUrl: verificationUrl.toString(),
  });

  if (!emailResult.sent) {
    logError("translator_request_resend_email_failed", "Failed to resend verification email.", {
      requestId: resend.requestId,
      reason: emailResult.error || "unknown",
    });
    return apiError(502, "UPSTREAM_ERROR", "Unable to send verification email right now.");
  }

  try {
    await markTranslatorRequestVerificationEmailSent(resend.requestId);
  } catch (error) {
    logWarn("translator_request_resend_mark_sent_failed", "Verification email sent but sentAt update failed.", {
      requestId: resend.requestId,
      error: error instanceof Error ? error.message : "unknown",
    });
  }

  return apiOk({
    resent: true,
  });
}
