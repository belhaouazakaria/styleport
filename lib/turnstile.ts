const TURNSTILE_VERIFY_ENDPOINT = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export interface TurnstileVerificationResult {
  success: boolean;
  skipped?: boolean;
  errorCodes?: string[];
}

export async function verifyTurnstileToken(params: {
  token?: string | null;
  ip?: string;
}): Promise<TurnstileVerificationResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  const isProduction = process.env.NODE_ENV === "production";

  if (!secret) {
    if (!isProduction) {
      return { success: true, skipped: true };
    }

    return { success: false, errorCodes: ["missing-secret"] };
  }

  if (!params.token?.trim()) {
    return { success: false, errorCodes: ["missing-input-response"] };
  }

  const body = new URLSearchParams();
  body.set("secret", secret);
  body.set("response", params.token.trim());

  if (params.ip?.trim()) {
    body.set("remoteip", params.ip.trim());
  }

  try {
    const response = await fetch(TURNSTILE_VERIFY_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });

    if (!response.ok) {
      return { success: false, errorCodes: ["verification-request-failed"] };
    }

    const payload = (await response.json()) as {
      success?: boolean;
      "error-codes"?: string[];
    };

    return {
      success: Boolean(payload.success),
      errorCodes: payload["error-codes"] || [],
    };
  } catch {
    return { success: false, errorCodes: ["verification-request-failed"] };
  }
}
