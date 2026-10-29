import { loadGrowthWorkerEnvironment } from "./growth-worker-bootstrap";

/**
 * Exit-once recovery helper for a future owner-approved cron/systemd timer.
 * No job claims, provider calls, AI, Pin publication or Telegram delivery.
 * The schedule is intentionally NOT installed by this release.
 */
async function main() {
  loadGrowthWorkerEnvironment();
  if (process.env.GROWTH_LEASE_CLEANUP_ENABLED !== "true") {
    console.log("GROWTH_LEASE_CLEANUP=DISABLED");
    return;
  }

  const raw = process.env.DATABASE_URL || "";
  let dbUrl: URL;
  try { dbUrl = new URL(raw); }
  catch { throw new Error("WATCHDOG_DATABASE_TARGET_INVALID"); }
  if (!["postgres:", "postgresql:"].includes(dbUrl.protocol) ||
      dbUrl.hostname !== "127.0.0.1" || dbUrl.port !== "5433" ||
      decodeURIComponent(dbUrl.pathname.slice(1)) !== "saytwist" ||
      dbUrl.searchParams.has("host")) {
    throw new Error("WATCHDOG_DATABASE_TARGET_INVALID");
  }

  const [{ expireGrowthWorkerActivation }, { prisma }] = await Promise.all([
    import("@/lib/growth/settings"),
    import("@/lib/prisma"),
  ]);
  try {
    const count = await expireGrowthWorkerActivation();
    console.log("GROWTH_LEASE_CLEANUP=" + (count === 1 ? "EXPIRED_REVOKED" : "NO_EXPIRED_LEASE"));
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch(() => {
  // Do not echo exception messages, URLs, env, tokens or database details.
  console.error("GROWTH_LEASE_CLEANUP=ERROR");
  process.exitCode = 1;
});
