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
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri?: string;
  token_uri?: string;
  auth_provider_x509_cert_url?: string;
  client_x509_cert_url?: string;
  universe_domain?: string;
}

interface ParsedCredentialState {
  mode: "missing" | "invalid" | "json";
  credentials: ServiceAccountCredentials | null;
  errors: string[];
}

function normalizePrivateKey(raw: string) {
  return raw.includes("\\n") ? raw.replace(/\\n/g, "\n") : raw;
}

function parseServiceAccountJson(raw: string | undefined): ParsedCredentialState {
  if (!raw?.trim()) {
    return {
      mode: "missing",
      credentials: null,
      errors: ["GOOGLE_SERVICE_ACCOUNT_JSON is not set."],
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      mode: "invalid",
      credentials: null,
      errors: ["GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON."],
    };
  }

  if (!parsed || typeof parsed !== "object") {
    return {
      mode: "invalid",
      credentials: null,
      errors: ["GOOGLE_SERVICE_ACCOUNT_JSON must be a JSON object."],
    };
  }

  const candidate = parsed as Record<string, unknown>;
  const requiredFields = ["type", "client_email", "private_key", "token_uri"] as const;
  const missingFields = requiredFields.filter((field) => {
    const value = candidate[field];
    return typeof value !== "string" || !value.trim();
  });

  if (missingFields.length) {
    return {
      mode: "invalid",
      credentials: null,
      errors: [`Missing required service account fields: ${missingFields.join(", ")}.`],
    };
  }

  if (candidate.type !== "service_account") {
    return {
      mode: "invalid",
      credentials: null,
      errors: ["Service account JSON must have type=service_account."],
    };
  }

  const privateKey = normalizePrivateKey(String(candidate.private_key));
  if (!privateKey.includes("BEGIN PRIVATE KEY")) {
    return {
      mode: "invalid",
      credentials: null,
      errors: ["Service account private_key format is invalid."],
    };
  }

  const credentials: ServiceAccountCredentials = {
    type: "service_account",
    project_id: String(candidate.project_id || ""),
    private_key_id: String(candidate.private_key_id || ""),
    private_key: privateKey,
    client_email: String(candidate.client_email),
    client_id: String(candidate.client_id || ""),
    auth_uri: typeof candidate.auth_uri === "string" ? candidate.auth_uri : undefined,
    token_uri: typeof candidate.token_uri === "string" ? candidate.token_uri : undefined,
    auth_provider_x509_cert_url:
      typeof candidate.auth_provider_x509_cert_url === "string"
        ? candidate.auth_provider_x509_cert_url
        : undefined,
    client_x509_cert_url:
      typeof candidate.client_x509_cert_url === "string" ? candidate.client_x509_cert_url : undefined,
    universe_domain:
      typeof candidate.universe_domain === "string" ? candidate.universe_domain : undefined,
  };

  return {
    mode: "json",
    credentials,
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
    aud: credentials.token_uri || GOOGLE_TOKEN_URI,
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
  const tokenUri = credentials.token_uri || GOOGLE_TOKEN_URI;
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion,
  });

  const response = await fetch(tokenUri, {
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
  const parsed = parseServiceAccountJson(env.GOOGLE_SERVICE_ACCOUNT_JSON);

  return {
    enabled: env.GOOGLE_INDEXING_ENABLED === true,
    dryRun: env.GOOGLE_INDEXING_DRY_RUN === true,
    credentialsConfigured: parsed.mode === "json",
    credentialMode: parsed.mode,
    serviceAccountEmail: parsed.credentials?.client_email || null,
    validationErrors: parsed.errors,
    baseUrl: getAppBaseUrl().toString().replace(/\/$/, ""),
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
    return {
      ok: false,
      url: normalizedUrl,
      status: "FAILED",
      message:
        status.validationErrors[0] ||
        "GOOGLE_SERVICE_ACCOUNT_JSON is missing or invalid.",
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

  const parsedCredentials = parseServiceAccountJson(getServerEnv().GOOGLE_SERVICE_ACCOUNT_JSON);
  if (!parsedCredentials.credentials) {
    return {
      ok: false,
      url: normalizedUrl,
      status: "FAILED",
      message: parsedCredentials.errors[0] || "Unable to load service account credentials.",
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
