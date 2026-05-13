import "server-only";

import { getAppBaseUrl, getServerEnv } from "@/lib/env";
import type { GoogleIndexingStatusSummary } from "@/lib/types";

type CredentialMethod = "private_key_base64" | "private_key_raw" | "service_account_json_base64";

interface CredentialCandidate {
  method: CredentialMethod;
  available: boolean;
  valid: boolean;
  projectId: string | null;
  clientEmail: string | null;
  privateKeyPresent: boolean;
  privateKeyValid: boolean;
  privateKey: string | null;
  missingFields: string[];
  errors: string[];
  warnings: string[];
}

export interface GoogleIndexingCredentials {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

interface ResolvedCredentialState {
  credentials: GoogleIndexingCredentials | null;
  status: GoogleIndexingStatusSummary;
}

function stripWrappingQuotes(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return trimmed;
  }

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function normalizeSimple(value: string | undefined) {
  if (!value) {
    return "";
  }
  return stripWrappingQuotes(value).trim();
}

function isValidServiceAccountEmail(value: string) {
  return /\.gserviceaccount\.com$/i.test(value);
}

export function decodeBase64Env(rawValue: string | undefined): string | null {
  if (!rawValue) {
    return null;
  }

  const stripped = stripWrappingQuotes(rawValue);
  const compact = stripped.replace(/\s+/g, "");
  if (!compact) {
    return null;
  }

  if (!/^[A-Za-z0-9+/=]+$/.test(compact)) {
    return null;
  }

  try {
    const decoded = Buffer.from(compact, "base64").toString("utf8");
    return decoded.trim() ? decoded : null;
  } catch {
    return null;
  }
}

export function normalizeGooglePrivateKey(rawKey: string | undefined): string | null {
  if (!rawKey) {
    return null;
  }

  let key = rawKey.trim();
  if (!key) {
    return null;
  }

  key = stripWrappingQuotes(key);
  key = key.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  key = key.replace(/\\\\n/g, "\n");
  key = key.replace(/\\n/g, "\n");
  key = key.trim();

  if (!key.includes("-----BEGIN PRIVATE KEY-----") || !key.includes("-----END PRIVATE KEY-----")) {
    return null;
  }

  return key;
}

function evaluatePrivateKeyBase64Candidate(env: ReturnType<typeof getServerEnv>): CredentialCandidate {
  const projectId = normalizeSimple(env.GOOGLE_PROJECT_ID) || null;
  const clientEmail = normalizeSimple(env.GOOGLE_CLIENT_EMAIL) || null;
  const privateKeyBase64 = normalizeSimple(env.GOOGLE_PRIVATE_KEY_BASE64);
  const available = Boolean(privateKeyBase64);
  const decodedKey = decodeBase64Env(privateKeyBase64 || undefined);
  const normalizedPrivateKey = normalizeGooglePrivateKey(decodedKey || undefined);

  const missingFields: string[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!projectId) {
    missingFields.push("GOOGLE_PROJECT_ID");
  }

  if (!clientEmail) {
    missingFields.push("GOOGLE_CLIENT_EMAIL");
  } else if (!isValidServiceAccountEmail(clientEmail)) {
    errors.push("GOOGLE_CLIENT_EMAIL must be a valid service account email.");
  }

  if (!privateKeyBase64) {
    missingFields.push("GOOGLE_PRIVATE_KEY_BASE64");
  } else if (!decodedKey) {
    errors.push("GOOGLE_PRIVATE_KEY_BASE64 could not be base64-decoded.");
  } else if (!normalizedPrivateKey) {
    errors.push("GOOGLE_PRIVATE_KEY_BASE64 decoded key is invalid or incorrectly formatted.");
  }

  if (!available) {
    warnings.push("GOOGLE_PRIVATE_KEY_BASE64 is missing. Falling back to lower-priority key methods when available.");
  }

  return {
    method: "private_key_base64",
    available,
    valid: available && missingFields.length === 0 && errors.length === 0,
    projectId,
    clientEmail,
    privateKeyPresent: Boolean(privateKeyBase64),
    privateKeyValid: Boolean(normalizedPrivateKey),
    privateKey: normalizedPrivateKey,
    missingFields,
    errors,
    warnings,
  };
}

function evaluatePrivateKeyRawCandidate(env: ReturnType<typeof getServerEnv>): CredentialCandidate {
  const projectId = normalizeSimple(env.GOOGLE_PROJECT_ID) || null;
  const clientEmail = normalizeSimple(env.GOOGLE_CLIENT_EMAIL) || null;
  const privateKeyRaw = env.GOOGLE_PRIVATE_KEY || "";
  const available = Boolean(privateKeyRaw.trim());
  const normalizedPrivateKey = normalizeGooglePrivateKey(privateKeyRaw);

  const missingFields: string[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!projectId) {
    missingFields.push("GOOGLE_PROJECT_ID");
  }

  if (!clientEmail) {
    missingFields.push("GOOGLE_CLIENT_EMAIL");
  } else if (!isValidServiceAccountEmail(clientEmail)) {
    errors.push("GOOGLE_CLIENT_EMAIL must be a valid service account email.");
  }

  if (!available) {
    missingFields.push("GOOGLE_PRIVATE_KEY");
  } else if (!normalizedPrivateKey) {
    errors.push("GOOGLE_PRIVATE_KEY is invalid or incorrectly formatted.");
  }

  if (available) {
    warnings.push("Raw private key env vars can break on some hosts. GOOGLE_PRIVATE_KEY_BASE64 is recommended.");
  }

  return {
    method: "private_key_raw",
    available,
    valid: available && missingFields.length === 0 && errors.length === 0,
    projectId,
    clientEmail,
    privateKeyPresent: available,
    privateKeyValid: Boolean(normalizedPrivateKey),
    privateKey: normalizedPrivateKey,
    missingFields,
    errors,
    warnings,
  };
}

function evaluateServiceAccountJsonBase64Candidate(
  env: ReturnType<typeof getServerEnv>,
): CredentialCandidate {
  const jsonBase64 = normalizeSimple(env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64);
  const available = Boolean(jsonBase64);
  const decodedJson = decodeBase64Env(jsonBase64 || undefined);

  let parsedProjectId = "";
  let parsedClientEmail = "";
  let parsedPrivateKeyRaw = "";
  const errors: string[] = [];
  const missingFields: string[] = [];
  const warnings: string[] = [];

  if (available && !decodedJson) {
    errors.push("GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 could not be base64-decoded.");
  }

  if (decodedJson) {
    try {
      const parsed = JSON.parse(decodedJson) as Record<string, unknown>;
      parsedProjectId = typeof parsed.project_id === "string" ? parsed.project_id : "";
      parsedClientEmail = typeof parsed.client_email === "string" ? parsed.client_email : "";
      parsedPrivateKeyRaw = typeof parsed.private_key === "string" ? parsed.private_key : "";
    } catch {
      errors.push("GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 is not valid JSON.");
    }
  }

  const projectId = normalizeSimple(parsedProjectId) || null;
  const clientEmail = normalizeSimple(parsedClientEmail) || null;
  const normalizedPrivateKey = normalizeGooglePrivateKey(parsedPrivateKeyRaw || undefined);

  if (!projectId) {
    missingFields.push("project_id (from GOOGLE_SERVICE_ACCOUNT_JSON_BASE64)");
  }

  if (!clientEmail) {
    missingFields.push("client_email (from GOOGLE_SERVICE_ACCOUNT_JSON_BASE64)");
  } else if (!isValidServiceAccountEmail(clientEmail)) {
    errors.push("client_email in GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 must be a valid service account email.");
  }

  if (!parsedPrivateKeyRaw) {
    missingFields.push("private_key (from GOOGLE_SERVICE_ACCOUNT_JSON_BASE64)");
  } else if (!normalizedPrivateKey) {
    errors.push("private_key in GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 is invalid or incorrectly formatted.");
  }

  if (available) {
    warnings.push("Using GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 fallback. GOOGLE_PRIVATE_KEY_BASE64 is recommended.");
  }

  return {
    method: "service_account_json_base64",
    available,
    valid: available && missingFields.length === 0 && errors.length === 0,
    projectId,
    clientEmail,
    privateKeyPresent: Boolean(parsedPrivateKeyRaw),
    privateKeyValid: Boolean(normalizedPrivateKey),
    privateKey: normalizedPrivateKey,
    missingFields,
    errors,
    warnings,
  };
}

function resolveCredentialState(): ResolvedCredentialState {
  const env = getServerEnv();
  const baseUrl = getAppBaseUrl().toString().replace(/\/$/, "");

  const candidates: CredentialCandidate[] = [
    evaluatePrivateKeyBase64Candidate(env),
    evaluatePrivateKeyRawCandidate(env),
    evaluateServiceAccountJsonBase64Candidate(env),
  ];

  const firstValid = candidates.find((candidate) => candidate.valid);
  const availableInvalid = candidates.filter((candidate) => candidate.available && !candidate.valid);

  if (firstValid && firstValid.privateKey) {
    const warnings = [...availableInvalid.flatMap((candidate) =>
      candidate.errors.map(
        (error) => `${candidate.method} is invalid: ${error}`,
      ),
    )];
    warnings.push(...firstValid.warnings);

    return {
      credentials: {
        projectId: firstValid.projectId!,
        clientEmail: firstValid.clientEmail!,
        privateKey: firstValid.privateKey,
      },
      status: {
        enabled: env.GOOGLE_INDEXING_ENABLED === true,
        dryRun: env.GOOGLE_INDEXING_DRY_RUN === true,
        credentialsConfigured: true,
        credentialMode: firstValid.method,
        activeCredentialMethod: firstValid.method,
        projectId: firstValid.projectId,
        projectIdConfigured: Boolean(firstValid.projectId),
        serviceAccountEmail: firstValid.clientEmail,
        serviceAccountEmailConfigured: Boolean(firstValid.clientEmail),
        privateKeyPresent: firstValid.privateKeyPresent,
        privateKeyValid: firstValid.privateKeyValid,
        missingFields: [],
        warnings,
        validationErrors: [],
        baseUrl,
      },
    };
  }

  const primary = availableInvalid[0] || candidates[0];
  const hasAnyCredentialInput = candidates.some((candidate) => candidate.available);

  return {
    credentials: null,
    status: {
      enabled: env.GOOGLE_INDEXING_ENABLED === true,
      dryRun: env.GOOGLE_INDEXING_DRY_RUN === true,
      credentialsConfigured: false,
      credentialMode: hasAnyCredentialInput ? "invalid" : "missing",
      activeCredentialMethod: null,
      projectId: primary.projectId,
      projectIdConfigured: Boolean(primary.projectId),
      serviceAccountEmail: primary.clientEmail,
      serviceAccountEmailConfigured: Boolean(primary.clientEmail),
      privateKeyPresent: primary.privateKeyPresent,
      privateKeyValid: primary.privateKeyValid,
      missingFields: primary.missingFields,
      warnings: primary.warnings,
      validationErrors: primary.errors,
      baseUrl,
    },
  };
}

export function getGoogleIndexingCredentials() {
  return resolveCredentialState().credentials;
}

export function getGoogleIndexingStatus(): GoogleIndexingStatusSummary {
  return resolveCredentialState().status;
}

