import { TelegramProvisioningError } from "@/lib/growth/reporting/provisioning";

/**
 * Explicitly allowlisted codes only. Never print thrown exception text:
 * network errors can embed the full Telegram bot-token URL.
 */
const PAIRING_FAILURE_CODES = new Set([
  "INVALID_PAIRING_CONFIGURATION",
  "INVALID_PAIRING_CODE",
  "PAIRING_REQUEST_FAILED",
  "INVALID_UPDATES_RESPONSE",
  "PAIRING_UPDATES_UNAVAILABLE",
  "INVALID_UPDATES",
  "PAIRING_MESSAGE_NOT_FOUND",
  "AMBIGUOUS_PRIVATE_RECIPIENT",
]);

export function safeGrowthTelegramPairingFailureCode(error: unknown): string {
  if (error instanceof TelegramProvisioningError &&
      PAIRING_FAILURE_CODES.has(error.code)) {
    return error.code;
  }
  if (error && typeof error === "object" &&
      "code" in error && error.code === "EEXIST") {
    return "PRIVATE_RECIPIENT_FILE_ALREADY_EXISTS";
  }
  return "UNEXPECTED_LOCAL_ERROR";
}
