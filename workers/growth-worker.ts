import { runGrowthWorker } from "@/lib/growth/worker";
import { toSafeGrowthError } from "@/lib/growth/safe-data";
import { prisma } from "@/lib/prisma";

const configuredBatchSize = process.env.GROWTH_WORKER_BATCH_SIZE
  ? Number(process.env.GROWTH_WORKER_BATCH_SIZE)
  : undefined;

void runGrowthWorker({
  batchSize: Number.isFinite(configuredBatchSize) ? configuredBatchSize : undefined,
})
  .then((result) => {
    console.log(`[growth-worker] ${result.status.toLowerCase()} claimed=${result.claimed} succeeded=${result.succeeded} failed=${result.failed}`);
  })
  .catch((error) => {
    console.error("[growth-worker] Fatal error", toSafeGrowthError(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
