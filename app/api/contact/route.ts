import { apiError, apiOk } from "@/lib/api-response";
import { sendContactMessageEmail } from "@/lib/email-alerts";
import { logError, logWarn } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";
import { extractClientIp } from "@/lib/utils";
import { contactMessageSchema } from "@/lib/validators";

export async function POST(request: Request) {
  const identifier = extractClientIp(request);
  const limit = checkRateLimit(`contact:${identifier}`);

  if (!limit.allowed) {
    return apiError(429, "RATE_LIMITED", "Too many contact submissions. Please try again shortly.");
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return apiError(400, "BAD_REQUEST", "Invalid JSON payload.");
  }

  const parsed = contactMessageSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(400, "VALIDATION_ERROR", "Please complete all required contact fields.");
  }

  if (parsed.data.honeypot?.trim()) {
    logWarn("contact_honeypot_triggered", "Contact form blocked by honeypot.", {
      identifier,
    });
    return apiError(403, "FORBIDDEN", "Submission blocked.");
  }

  const result = await sendContactMessageEmail({
    name: parsed.data.name,
    email: parsed.data.email,
    message: parsed.data.message,
  });

  if (!result.sent) {
    logError("contact_submit_failed", "Unable to deliver contact email.", {
      reason: result.error || "unknown",
    });
    return apiError(502, "UPSTREAM_ERROR", "Unable to deliver your message right now.");
  }

  return apiOk({ delivered: true }, 201);
}
