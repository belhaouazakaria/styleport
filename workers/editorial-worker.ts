import { runEditorialWorker } from "@/lib/translator-editorial-jobs";

void runEditorialWorker({ once: process.argv.includes("--once") }).catch((error) => {
  console.error("[editorial-worker] Fatal error", error);
  process.exitCode = 1;
});
