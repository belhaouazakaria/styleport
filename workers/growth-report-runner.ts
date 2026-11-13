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
    // The separately enabled private Telegram courier sends at most three
    // recently prepared Pins for individual review. It never publishes.
    // No courier failure can turn a confirmed report into a second send.
    if (process.env.GROWTH_TELEGRAM_PIN_APPROVALS_ENABLED === "true") {
      const { dispatchPendingPinReviews } = await import("@/lib/growth/publishing/telegram-pin-review");
      await dispatchPendingPinReviews().catch((error) => {
        console.error("[growth-pin-review] blocked", toSafeGrowthError(error));
      });
    }
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
