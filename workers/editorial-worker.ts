import { runEditorialWorker } from "@/lib/translator-editorial-jobs";

const enabled = process.env.TRANSLATOR_EDITORIAL_WORKER_ENABLED === "true";

if (!enabled) {
  console.log("[editorial-worker] Disabled. Set TRANSLATOR_EDITORIAL_WORKER_ENABLED=true to run it.");
  process.exit(0);
}

void runEditorialWorker({ once: process.argv.includes("--once") }).catch((error) => {
  console.error("[editorial-worker] Fatal error", error);
  process.exitCode = 1;
});
