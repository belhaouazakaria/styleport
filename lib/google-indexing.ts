import "server-only";

import crypto from "node:crypto";

import {
  getGoogleIndexingCredentials,
  getGoogleIndexingStatus,
} from "@/lib/google-indexing/credentials";
import type { IndexingSubmissionResult } from "@/lib/types";

const GOOGLE_INDEXING_SCOPE = "https://www.googleapis.com/auth/indexing";
const GOOGLE_TOKEN_URI = "https://oauth2.googleapis.com/token";
const GOOGLE_INDEXING_ENDPOINT = "https://indexing.googleapis.com/v3/urlNotifications:publish";

function mapGoogleCredentialError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  const normalized = message.toLowerCase();

  if (
    normalized.includes("decoder routines::unsupported") ||
    normalized.includes("error:1e08010c") ||
    normalized.includes("pem routines") ||
    normalized.includes("no start line") ||
    normalized.includes("bad decrypt") ||
    normalized.includes("private key")
  ) {
    return "Google private key could not be decoded. Use GOOGLE_PRIVATE_KEY_BASE64 instead of GOOGLE_PRIVATE_KEY.";
  }

  return error instanceof Error
    ? error.message
    : "Unable to submit URL to Google Indexing API.";
}

function base64urlEncode(value: string | Buffer) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function buildSignedJwt(credentials: { clientEmail: string; privateKey: string }) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: credentials.clientEmail,
    scope: GOOGLE_INDEXING_SCOPE,
    aud: GOOGLE_TOKEN_URI,
    iat: now,
    exp: now + 3600,
  };

  const encodedHeader = base64urlEncode(JSON.stringify(header));
  const encodedPayload = base64urlEncode(JSON.stringify(payload));
  const unsignedToken = `${encodedHeader}.${encodedPayload}`;

  const signer = crypto.createSign("RSA-SHA256");
  signer.update(unsignedToken);
  signer.end();

  const signature = signer.sign(credentials.privateKey);
  return `${unsignedToken}.${base64urlEncode(signature)}`;
}

async function fetchAccessToken(credentials: { clientEmail: string; privateKey: string }) {
  const assertion = buildSignedJwt(credentials);
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion,
  });

  const response = await fetch(GOOGLE_TOKEN_URI, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as
    | { access_token?: string; error?: string; error_description?: string }
    | null;

  if (!response.ok || !payload?.access_token) {
    throw new Error(
      payload?.error_description || payload?.error || `Token request failed (${response.status}).`,
    );
  }

  return payload.access_token;
}

export { getGoogleIndexingStatus } from "@/lib/google-indexing/credentials";

export async function submitUrlToGoogleIndexing(
  url: string,
): Promise<IndexingSubmissionResult> {
  const normalizedUrl = url.trim();

  if (!normalizedUrl) {
    return {
      ok: false,
      url,
      status: "FAILED",
      provider: "GOOGLE_INDEXING_API",
      message: "URL is required.",
    };
  }

  try {
    const parsedUrl = new URL(normalizedUrl);
    if (parsedUrl.protocol !== "https:") {
      return {
        ok: false,
        url: normalizedUrl,
        status: "FAILED",
        provider: "GOOGLE_INDEXING_API",
        message: "Only HTTPS URLs can be submitted.",
      };
    }
  } catch {
    return {
      ok: false,
      url: normalizedUrl,
      status: "FAILED",
      provider: "GOOGLE_INDEXING_API",
      message: "URL is invalid.",
    };
  }

  const status = getGoogleIndexingStatus();
  if (!status.enabled) {
    return {
      ok: true,
      url: normalizedUrl,
      status: "SKIPPED",
      provider: "GOOGLE_INDEXING_API",
      message: "Google Indexing API is disabled.",
    };
  }

  if (!status.credentialsConfigured) {
    return {
      ok: false,
      url: normalizedUrl,
      status: "FAILED",
      provider: "GOOGLE_INDEXING_API",
      message:
        "Google Indexing credentials are invalid. Use GOOGLE_PRIVATE_KEY_BASE64 to avoid newline formatting issues.",
    };
  }

  if (status.dryRun) {
    return {
      ok: true,
      url: normalizedUrl,
      status: "DRY_RUN",
      provider: "GOOGLE_INDEXING_API",
      message: "Dry-run mode enabled. Request not sent to Google.",
    };
  }

  const credentials = getGoogleIndexingCredentials();
  if (!credentials) {
    return {
      ok: false,
      url: normalizedUrl,
      status: "FAILED",
      provider: "GOOGLE_INDEXING_API",
      message:
        "Google Indexing credentials are invalid. Use GOOGLE_PRIVATE_KEY_BASE64 to avoid newline formatting issues.",
    };
  }

  try {
    const accessToken = await fetchAccessToken({
      clientEmail: credentials.clientEmail,
      privateKey: credentials.privateKey,
    });

    const response = await fetch(GOOGLE_INDEXING_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: normalizedUrl,
        type: "URL_UPDATED",
      }),
      cache: "no-store",
    });

    const payload = (await response.json().catch(() => null)) as
      | { error?: { code?: number; message?: string; status?: string } }
      | Record<string, unknown>
      | null;

    if (!response.ok) {
      const errorMessage =
        (payload as { error?: { message?: string } } | null)?.error?.message ||
        `Google Indexing API request failed (${response.status}).`;
      return {
        ok: false,
        url: normalizedUrl,
        status: "FAILED",
        provider: "GOOGLE_INDEXING_API",
        message: errorMessage,
        response: payload,
      };
    }

    return {
      ok: true,
      url: normalizedUrl,
      status: "SUBMITTED",
      provider: "GOOGLE_INDEXING_API",
      message: "Google Indexing API submission requested. Final indexing is not guaranteed.",
      response: payload,
    };
  } catch (error) {
    return {
      ok: false,
      url: normalizedUrl,
      status: "FAILED",
      provider: "GOOGLE_INDEXING_API",
      message: mapGoogleCredentialError(error),
    };
  }
}

