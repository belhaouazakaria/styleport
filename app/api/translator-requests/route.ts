import { apiError, apiOk } from "@/lib/api-response";
import { createPublicTranslatorRequest } from "@/lib/data/requests";
import { logError, logWarn } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";
import { verifyTurnstileToken } from "@/lib/turnstile";
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
    return apiError(400, "VALIDATION_ERROR", "Please add a translator idea and a short description.");
  }

  if (parsed.data.honeypot?.trim()) {
    logWarn("translator_request_honeypot_triggered", "Translator request blocked by honeypot.");
    return apiError(403, "FORBIDDEN", "Submission blocked.");
  }

  const turnstile = await verifyTurnstileToken({
    token: parsed.data.turnstileToken,
    ip: identifier,
  });

  if (!turnstile.success) {
    logWarn("translator_request_turnstile_failed", "Translator request failed captcha verification.", {
      errorCodes: turnstile.errorCodes,
    });
    return apiError(403, "FORBIDDEN", "Captcha verification failed.");
  }

  try {
    const created = await createPublicTranslatorRequest(parsed.data);

    return apiOk({ requestId: created.id }, 201);
  } catch (error) {
    logError("translator_request_create_failed", "Failed to persist translator request.", undefined, error);
    return apiError(500, "UPSTREAM_ERROR", "Unable to submit request right now.");
  }
}
