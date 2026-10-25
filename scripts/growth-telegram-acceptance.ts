import { loadEnvConfig } from "@next/env";

// Match the one-shot Growth workers' environment loading, but do not start a
// worker, polling loop, scheduler or background process.
loadEnvConfig(process.cwd());

async function main() {
  try {
    const { runControlledGrowthTelegramAcceptance } =
      await import("@/lib/growth/reporting/acceptance");
    const outcome = await runControlledGrowthTelegramAcceptance();
    if (outcome.status === "DISABLED") {
      console.log("[growth-telegram] Acceptance disabled; no archive or send.");
      return;
    }
    // Do not print bot token, recipient, provider request URL or Telegram payload.
    console.log("[growth-telegram] One acceptance attempt:", outcome.status,
      "for", outcome.reportId);
    console.log("[growth-telegram] API submission is NOT a receipt; check the private Telegram chat.");
  } catch {
    console.error("[growth-telegram] Acceptance blocked or outcome uncertain. Do not retry.");
    process.exitCode = 1;
  }
}

void main();
