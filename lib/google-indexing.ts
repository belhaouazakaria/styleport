import "server-only";

import crypto from "node:crypto";

import { getAppBaseUrl, getServerEnv } from "@/lib/env";
import type { GoogleIndexingStatusSummary, IndexingSubmissionResult } from "@/lib/types";

const GOOGLE_INDEXING_SCOPE = "https://www.googleapis.com/auth/indexing";
const GOOGLE_TOKEN_URI = "https://oauth2.googleapis.com/token";
const GOOGLE_INDEXING_ENDPOINT = "https://indexing.googleapis.com/v3/urlNotifications:publish";

interface ServiceAccountCredentials {
  type: "service_account";
  project_id: string;
  private_key: string;
  client_email: string;
  token_uri: string;
}

type MissingCredentialField =
  | "GOOGLE_CLIENT_EMAIL"
  | "GOOGLE_PRIVATE_KEY"
  | "GOOGLE_PROJECT_ID";

interface ParsedCredentialState {
  credentials: ServiceAccountCredentials | null;
  missingFields: MissingCredentialField[];
  errors: string[];
}

function stripWrappingQuotes(value: string) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function normalizePrivateKey(raw: string) {
  const unquoted = stripWrappingQuotes(raw);
  return unquoted.includes("\\n") ? unquoted.replace(/\\n/g, "\n") : unquoted;
}

function parseSplitServiceAccountCredentials(): ParsedCredentialState {
  const env = getServerEnv();
  const clientEmailRaw = env.GOOGLE_CLIENT_EMAIL || "";
  const privateKeyRaw = env.GOOGLE_PRIVATE_KEY || "";
  const projectIdRaw = env.GOOGLE_PROJECT_ID || "";

  const clientEmail = stripWrappingQuotes(clientEmailRaw);
  const privateKey = normalizePrivateKey(privateKeyRaw);
  const projectId = stripWrappingQuotes(projectIdRaw);

  const missingFields: MissingCredentialField[] = [];
  const errors: string[] = [];

  if (!clientEmail) {
    missingFields.push("GOOGLE_CLIENT_EMAIL");
  } else if (!/\.gserviceaccount\.com$/i.test(clientEmail)) {
    errors.push("GOOGLE_CLIENT_EMAIL must be a valid service account email.");
  }

  if (!privateKey) {
    missingFields.push("GOOGLE_PRIVATE_KEY");
  } else if (!privateKey.includes("BEGIN PRIVATE KEY")) {
    errors.push("GOOGLE_PRIVATE_KEY format is invalid.");
  }

  if (!projectId) {
    missingFields.push("GOOGLE_PROJECT_ID");
  }

  if (missingFields.length || errors.length) {
    return {
      credentials: null,
      missingFields,
      errors,
    };
  }

  return {
    credentials: {
      type: "service_account",
      project_id: projectId,
      private_key: privateKey,
      client_email: clientEmail,
      token_uri: GOOGLE_TOKEN_URI,
    },
    missingFields: [],
    errors: [],
  };
}

function base64urlEncode(value: string | Buffer) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function buildSignedJwt(credentials: ServiceAccountCredentials) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: credentials.client_email,
    scope: GOOGLE_INDEXING_SCOPE,
    aud: credentials.token_uri,
    iat: now,
    exp: now + 3600,
  };

  const encodedHeader = base64urlEncode(JSON.stringify(header));
  const encodedPayload = base64urlEncode(JSON.stringify(payload));
  const unsignedToken = `${encodedHeader}.${encodedPayload}`;

  const signer = crypto.createSign("RSA-SHA256");
  signer.update(unsignedToken);
  signer.end();

  const signature = signer.sign(credentials.private_key);
  return `${unsignedToken}.${base64urlEncode(signature)}`;
}

async function fetchAccessToken(credentials: ServiceAccountCredentials) {
  const assertion = buildSignedJwt(credentials);
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion,
  });

  const response = await fetch(credentials.token_uri, {
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

export function getGoogleIndexingStatus(): GoogleIndexingStatusSummary {
  const env = getServerEnv();
  const parsed = parseSplitServiceAccountCredentials();
  const baseUrl = getAppBaseUrl().toString().replace(/\/$/, "");

  return {
    enabled: env.GOOGLE_INDEXING_ENABLED === true,
    dryRun: env.GOOGLE_INDEXING_DRY_RUN === true,
    credentialsConfigured: Boolean(parsed.credentials),
    credentialMode: "split-env-vars",
    projectId: parsed.credentials?.project_id || null,
    serviceAccountEmail: parsed.credentials?.client_email || null,
    missingFields: parsed.missingFields,
    validationErrors: parsed.errors,
    baseUrl,
  };
}

export async function submitUrlToGoogleIndexing(
  url: string,
): Promise<IndexingSubmissionResult> {
  const normalizedUrl = url.trim();

  if (!normalizedUrl) {
    return {
      ok: false,
      url,
      status: "FAILED",
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
        message: "Only HTTPS URLs can be submitted.",
      };
    }
  } catch {
    return {
      ok: false,
      url: normalizedUrl,
      status: "FAILED",
      message: "URL is invalid.",
    };
  }

  const status = getGoogleIndexingStatus();
  if (!status.enabled) {
    return {
      ok: true,
      url: normalizedUrl,
      status: "SKIPPED",
      message: "Google Indexing API is disabled.",
    };
  }

  if (!status.credentialsConfigured) {
    const missingMessage = status.missingFields.length
      ? `Missing required env vars: ${status.missingFields.join(", ")}.`
      : null;
    return {
      ok: false,
      url: normalizedUrl,
      status: "FAILED",
      message:
        missingMessage ||
        status.validationErrors[0] ||
        "Google Indexing credentials are missing or invalid.",
    };
  }

  if (status.dryRun) {
    return {
      ok: true,
      url: normalizedUrl,
      status: "DRY_RUN",
      message: "Dry-run mode enabled. Request not sent to Google.",
    };
  }

  const parsedCredentials = parseSplitServiceAccountCredentials();
  if (!parsedCredentials.credentials) {
    const missingMessage = parsedCredentials.missingFields.length
      ? `Missing required env vars: ${parsedCredentials.missingFields.join(", ")}.`
      : null;
    return {
      ok: false,
      url: normalizedUrl,
      status: "FAILED",
      message:
        missingMessage ||
        parsedCredentials.errors[0] ||
        "Unable to load Google service account credentials.",
    };
  }

  try {
    const accessToken = await fetchAccessToken(parsedCredentials.credentials);
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
        message: errorMessage,
        response: payload,
      };
    }

    return {
      ok: true,
      url: normalizedUrl,
      status: "SUBMITTED",
      message: "Google Indexing API submission requested. Final indexing is not guaranteed.",
      response: payload,
    };
  } catch (error) {
    return {
      ok: false,
      url: normalizedUrl,
      status: "FAILED",
      message: error instanceof Error ? error.message : "Unable to submit URL to Google Indexing API.",
    };
  }
}
