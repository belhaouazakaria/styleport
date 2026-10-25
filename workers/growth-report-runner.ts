import { loadGrowthWorkerEnvironment } from "./growth-worker-bootstrap";

async function main() {
  loadGrowthWorkerEnvironment();
  const [{ runScheduledGrowthDailyReport }, { toSafeGrowthError }, { prisma }] = await Promise.all([
    import("@/lib/growth/reporting/daily-runner"),
    import("@/lib/growth/safe-data"),
    import("@/lib/prisma"),
  ]);
  try {
    const result = await runScheduledGrowthDailyReport();
    // No bot tokens, recipient IDs, archived digest text, or credentials.
    console.log("[growth-report] " + result.status);
  } catch (error) {
    console.error("[growth-report] blocked", toSafeGrowthError(error));
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void main();
