import { getServerEnv } from "@/lib/env";

const env = getServerEnv();

const requiredPairs: Array<[string, string | undefined]> = [
  ["APP_BASE_URL or NEXTAUTH_URL", env.APP_BASE_URL || env.NEXTAUTH_URL],
  ["NEXTAUTH_SECRET", env.NEXTAUTH_SECRET],
  ["DATABASE_URL", env.DATABASE_URL],
  ["OPENAI_API_KEY", env.OPENAI_API_KEY],
  ["IP_HASH_SECRET", env.IP_HASH_SECRET],
  ["ALERT_ADMIN_EMAIL", env.ALERT_ADMIN_EMAIL],
  ["EMAIL_FROM", env.EMAIL_FROM],
  ["BREVO_API_KEY", env.BREVO_API_KEY],
];

const missing = requiredPairs.filter(([, value]) => !value).map(([name]) => name);

if (missing.length) {
  console.error(
    `[env] Missing required production environment variables: ${missing.join(", ")}`,
  );
  process.exit(1);
}

const baseUrl = env.APP_BASE_URL || env.NEXTAUTH_URL;
if (baseUrl) {
  try {
    const parsed = new URL(baseUrl);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error("Unsupported protocol");
    }
  } catch {
    console.error("[env] APP_BASE_URL/NEXTAUTH_URL must be a valid absolute URL.");
    process.exit(1);
  }
}

if (env.ALERT_ADMIN_EMAIL) {
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(env.ALERT_ADMIN_EMAIL)) {
    console.error("[env] ALERT_ADMIN_EMAIL must be a valid email address.");
    process.exit(1);
  }
}

if (env.EMAIL_FROM) {
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const fromPattern = /^.+<\s*[^\s@]+@[^\s@]+\.[^\s@]+\s*>$/;
  if (!emailPattern.test(env.EMAIL_FROM) && !fromPattern.test(env.EMAIL_FROM)) {
    console.error(
      "[env] EMAIL_FROM must be a valid email or display format like 'StylePort Alerts <alerts@yourdomain.com>'.",
    );
    process.exit(1);
  }
}

if (env.NEXTAUTH_SECRET && env.NEXTAUTH_SECRET.length < 24) {
  console.error("[env] NEXTAUTH_SECRET must be at least 24 characters.");
  process.exit(1);
}

if (env.IP_HASH_SECRET && env.IP_HASH_SECRET.length < 16) {
  console.error("[env] IP_HASH_SECRET must be at least 16 characters.");
  process.exit(1);
}

console.info("[env] Production environment validation passed.");
