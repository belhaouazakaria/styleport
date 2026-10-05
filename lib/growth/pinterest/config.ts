
import { GrowthPinterestApiEnvironment } from "@prisma/client";
import { z } from "zod";

import { PinterestConfigurationError } from "@/lib/growth/errors";

export const PINTEREST_OAUTH_SCOPES = [
  "user_accounts:read",
  "boards:read",
  "pins:read",
  "pins:write",
] as const;

export const PINTEREST_OAUTH_CALLBACK_PATH = "/api/admin/growth/pinterest/oauth/callback";
export const PINTEREST_OAUTH_STATE_TTL_MS = 10 * 60_000;
export const PINTEREST_ACCESS_TOKEN_REFRESH_WINDOW_MS = 5 * 60_000;

const environmentSchema = z.enum(["sandbox", "production"]);
export const PINTEREST_REQUIRED_ENVIRONMENT_NAMES = [
  "PINTEREST_APP_ID",
  "PINTEREST_APP_SECRET",
  "PINTEREST_REDIRECT_URI",
  "PINTEREST_API_ENVIRONMENT",
  "GROWTH_CREDENTIAL_ENCRYPTION_KEY",
] as const;

const configSchema = z.object({
  appId: z.string().min(1),
  appSecret: z.string().min(1),
  redirectUri: z.string().url(),
  environment: environmentSchema,
  encryptionKey: z.string().min(1),
});

export type PinterestConfiguration = z.infer<typeof configSchema> & {
  apiEnvironment: GrowthPinterestApiEnvironment;
  apiBaseUrl: string;
};

export type PinterestConfigurationState =
  | { configured: true; missingNames: []; environment: z.infer<typeof environmentSchema> }
  | { configured: false; missingNames: string[]; environment: z.infer<typeof environmentSchema> | null; error?: string };

function rawPinterestConfiguration() {
  const [appId, appSecret, redirectUri, environment, encryptionKey] = PINTEREST_REQUIRED_ENVIRONMENT_NAMES.map((name) => process.env[name]);
  return { appId, appSecret, redirectUri, environment, encryptionKey };
}

function validEncryptionKey(encoded: string) {
  const key = Buffer.from(encoded, "base64");
  return key.length === 32 && key.toString("base64").replace(/=+$/, "") === encoded.trim().replace(/=+$/, "");
}

function resolvePinterestConfiguration(): { state: PinterestConfigurationState; config?: PinterestConfiguration } {
  const values = rawPinterestConfiguration();
  const missingNames = PINTEREST_REQUIRED_ENVIRONMENT_NAMES.filter((name) => !process.env[name]);
  const environment = environmentSchema.safeParse(values.environment).data || null;
  if (missingNames.length) return { state: { configured: false, missingNames, environment } };

  const parsed = configSchema.safeParse(values);
  if (!parsed.success || !validEncryptionKey(parsed.data.encryptionKey)) {
    return { state: { configured: false, missingNames: [], environment, error: "Pinterest configuration is invalid." } };
  }
  const redirect = new URL(parsed.data.redirectUri);
  if (redirect.pathname !== PINTEREST_OAUTH_CALLBACK_PATH || redirect.search || redirect.hash) {
    return { state: { configured: false, missingNames: [], environment, error: `PINTEREST_REDIRECT_URI must use ${PINTEREST_OAUTH_CALLBACK_PATH} exactly.` } };
  }
  const production = parsed.data.environment === "production";
  return {
    state: { configured: true, missingNames: [], environment: parsed.data.environment },
    config: {
      ...parsed.data,
      apiEnvironment: production ? GrowthPinterestApiEnvironment.PRODUCTION : GrowthPinterestApiEnvironment.SANDBOX,
      apiBaseUrl: production ? "https://api.pinterest.com/v5" : "https://api-sandbox.pinterest.com/v5",
    },
  };
}

export function getPinterestConfigurationState(): PinterestConfigurationState {
  return resolvePinterestConfiguration().state;
}

export function requirePinterestConfiguration(): PinterestConfiguration {
  const { state, config } = resolvePinterestConfiguration();
  if (!state.configured) {
    throw new PinterestConfigurationError(state.error || `Pinterest is not configured (${state.missingNames.join(", ")}).`);
  }
  if (!config) throw new PinterestConfigurationError("Pinterest configuration is invalid.");
  return config;
}
