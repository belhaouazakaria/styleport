
import { GrowthPinterestApiEnvironment } from "@prisma/client";
import { z } from "zod";

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

export function getPinterestConfigurationState():
  | { configured: true; config: PinterestConfiguration }
  | { configured: false; missing: string[]; error?: string } {
  const values = {
    appId: process.env.PINTEREST_APP_ID,
    appSecret: process.env.PINTEREST_APP_SECRET,
    redirectUri: process.env.PINTEREST_REDIRECT_URI,
    environment: process.env.PINTEREST_API_ENVIRONMENT,
    encryptionKey: process.env.GROWTH_CREDENTIAL_ENCRYPTION_KEY,
  };
  const missing = Object.entries(values).filter(([, value]) => !value).map(([key]) => ({
    appId: "PINTEREST_APP_ID",
    appSecret: "PINTEREST_APP_SECRET",
    redirectUri: "PINTEREST_REDIRECT_URI",
    environment: "PINTEREST_API_ENVIRONMENT",
    encryptionKey: "GROWTH_CREDENTIAL_ENCRYPTION_KEY",
  })[key as keyof typeof values]);
  if (missing.length) return { configured: false, missing };

  const parsed = configSchema.safeParse(values);
  if (!parsed.success) return { configured: false, missing: [], error: "Pinterest configuration is invalid." };
  const redirect = new URL(parsed.data.redirectUri);
  if (redirect.pathname !== PINTEREST_OAUTH_CALLBACK_PATH || redirect.search || redirect.hash) {
    return { configured: false, missing: [], error: `PINTEREST_REDIRECT_URI must use ${PINTEREST_OAUTH_CALLBACK_PATH} exactly.` };
  }
  const production = parsed.data.environment === "production";
  return {
    configured: true,
    config: {
      ...parsed.data,
      apiEnvironment: production ? GrowthPinterestApiEnvironment.PRODUCTION : GrowthPinterestApiEnvironment.SANDBOX,
      apiBaseUrl: production ? "https://api.pinterest.com/v5" : "https://api-sandbox.pinterest.com/v5",
    },
  };
}

export function requirePinterestConfiguration(): PinterestConfiguration {
  const state = getPinterestConfigurationState();
  if (!state.configured) throw new Error(state.error || `Pinterest is not configured (${state.missing.join(", ")}).`);
  return state.config;
}
