import { z } from "zod";

const booleanParser = z
  .string()
  .optional()
  .transform((value) => {
    if (value == null) return undefined;
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "off"].includes(normalized)) return false;
    return undefined;
  });

const integerParser = z
  .string()
  .optional()
  .transform((value) => {
    if (value == null || value.trim() === "") return undefined;
    const number = Number(value);
    if (!Number.isFinite(number) || !Number.isInteger(number)) return undefined;
    return number;
  });

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_BASE_URL: z.string().optional(),
  DATABASE_URL: z.string().min(1).optional(),
  NEXTAUTH_URL: z.string().optional(),
  NEXTAUTH_SECRET: z.string().optional(),
  OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_MODEL: z.string().min(1).optional(),
  NEXT_PUBLIC_APP_NAME: z.string().min(1).optional(),
  ALERT_ADMIN_EMAIL: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  BREVO_API_KEY: z.string().min(1).optional(),
  IP_HASH_SECRET: z.string().optional(),
  SHARE_IMAGE_STORAGE_DIR: z.string().optional(),
  SHARE_IMAGE_PUBLIC_PATH_PREFIX: z.string().optional(),
  TRUST_PROXY_HEADERS: booleanParser,
  USAGE_PROTECTION_ENABLED: booleanParser,
  IP_RATE_LIMIT_PER_MINUTE: integerParser,
  IP_RATE_LIMIT_PER_HOUR: integerParser,
  IP_RATE_LIMIT_PER_DAY: integerParser,
  GLOBAL_DAILY_TOKEN_CAP: integerParser,
  AUTO_EMERGENCY_SHUTDOWN_ENABLED: booleanParser,
});

export type ServerEnv = z.infer<typeof envSchema>;

let cachedServerEnv: ServerEnv | null = null;

function formatIssues(issues: z.ZodIssue[]) {
  return issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
}

export function getServerEnv(): ServerEnv {
  const shouldUseCache = process.env.NODE_ENV === "production";

  if (shouldUseCache && cachedServerEnv) {
    return cachedServerEnv;
  }

  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid environment configuration: ${formatIssues(parsed.error.issues)}`);
  }

  if (shouldUseCache) {
    cachedServerEnv = parsed.data;
    return cachedServerEnv;
  }

  return parsed.data;
}

export function getAppBaseUrl() {
  const env = getServerEnv();
  const raw = env.APP_BASE_URL || env.NEXTAUTH_URL || "http://localhost:3000";

  try {
    return new URL(raw);
  } catch {
    return new URL("http://localhost:3000");
  }
}
