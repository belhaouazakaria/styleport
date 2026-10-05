import { loadGrowthWorkerEnvironment } from "./growth-worker-bootstrap";

async function main() {
  loadGrowthWorkerEnvironment();
  const [{ runGrowthWorker }, { toSafeGrowthError }, { prisma }] = await Promise.all([
    import("@/lib/growth/worker"),
    import("@/lib/growth/safe-data"),
    import("@/lib/prisma"),
  ]);
  const configuredBatchSize = process.env.GROWTH_WORKER_BATCH_SIZE
    ? Number(process.env.GROWTH_WORKER_BATCH_SIZE)
    : undefined;

  try {
    const result = await runGrowthWorker({
      batchSize: Number.isFinite(configuredBatchSize) ? configuredBatchSize : undefined,
    });
    console.log(`[growth-worker] ${result.status.toLowerCase()} claimed=${result.claimed} succeeded=${result.succeeded} failed=${result.failed}`);
  } catch (error) {
    console.error("[growth-worker] Fatal error", toSafeGrowthError(error));
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void main();
