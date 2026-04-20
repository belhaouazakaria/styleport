import { apiError, apiOk } from "@/lib/api-response";
import { createPublicTranslatorRequest } from "@/lib/data/requests";
import { checkRateLimit } from "@/lib/rate-limit";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { extractClientIp } from "@/lib/utils";
import { translatorRequestSchema } from "@/lib/validators";

export async function POST(request: Request) {
  const identifier = extractClientIp(request);
  const limit = checkRateLimit(`translator-request:${identifier}`);

  if (!limit.allowed) {
    return apiError(429, "RATE_LIMITED", "Too many request submissions. Please try again shortly.");
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return apiError(400, "BAD_REQUEST", "Invalid JSON payload.");
  }

  const parsed = translatorRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(400, "VALIDATION_ERROR", "Please add a translator idea and a short description.");
  }

  if (parsed.data.honeypot?.trim()) {
    return apiError(403, "FORBIDDEN", "Submission blocked.");
  }

  const turnstile = await verifyTurnstileToken({
    token: parsed.data.turnstileToken,
    ip: identifier,
  });

  if (!turnstile.success) {
    return apiError(403, "FORBIDDEN", "Captcha verification failed.");
  }

  const created = await createPublicTranslatorRequest(parsed.data);

  return apiOk({ requestId: created.id }, 201);
}
