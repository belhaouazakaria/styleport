import { getServerEnv } from "@/lib/env";

const env = getServerEnv();

const requiredPairs: Array<[string, string | undefined]> = [
  ["APP_BASE_URL or NEXTAUTH_URL", env.APP_BASE_URL || env.NEXTAUTH_URL],
  ["NEXTAUTH_SECRET", env.NEXTAUTH_SECRET],
  ["DATABASE_URL", env.DATABASE_URL],
  ["OPENAI_API_KEY", env.OPENAI_API_KEY],
  ["TURNSTILE_SECRET_KEY", env.TURNSTILE_SECRET_KEY],
  ["IP_HASH_SECRET", env.IP_HASH_SECRET],
  ["ALERT_ADMIN_EMAIL", env.ALERT_ADMIN_EMAIL],
  ["EMAIL_FROM", env.EMAIL_FROM],
  ["RESEND_API_KEY", env.RESEND_API_KEY],
];

const missing = requiredPairs.filter(([, value]) => !value).map(([name]) => name);

if (missing.length) {
  console.error(
    `[env] Missing required production environment variables: ${missing.join(", ")}`,
  );
  process.exit(1);
}

console.info("[env] Production environment validation passed.");
