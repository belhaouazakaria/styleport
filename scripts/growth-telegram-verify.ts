import { verifyGrowthTelegramProvisioning } from "@/lib/growth/reporting/provisioning";

/**
 * One-time, read-only diagnostic. No Telegram messages or DB writes.
 * Run from a private terminal, supplying token and chat ID via secrets
 * already present in the process environment. Never print actual values.
 */
async function main() {
  try {
    const result = await verifyGrowthTelegramProvisioning();
    console.log("[growth-telegram] bot verified:", result.botVerified);
    console.log("[growth-telegram] private chat verified:", result.privateRecipientVerified);
    console.log("[growth-telegram] No messages sent; delivery remains disabled.");
  } catch {
    console.error("[growth-telegram] Verification failed: check bot, private chat and secret configuration.");
    process.exitCode = 1;
  }
}

void main();
