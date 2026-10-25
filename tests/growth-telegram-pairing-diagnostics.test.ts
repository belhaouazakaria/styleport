import { describe, expect, it } from "vitest";
import { TelegramProvisioningError } from "@/lib/growth/reporting/provisioning";
import { safeGrowthTelegramPairingFailureCode } from "@/lib/growth/reporting/pairing-diagnostics";

describe("Read-only Telegram pairing CLI safe failure classification", () => {
  it("prints only recognized reasons, never a token-bearing response", () => {
    for (const code of [
      "INVALID_PAIRING_CONFIGURATION",
      "PAIRING_REQUEST_FAILED",
      "PAIRING_UPDATES_UNAVAILABLE",
      "PAIRING_MESSAGE_NOT_FOUND",
      "AMBIGUOUS_PRIVATE_RECIPIENT",
    ]) {
      expect(safeGrowthTelegramPairingFailureCode(new TelegramProvisioningError(code)))
        .toBe(code);
    }
    const raw = "https://api.telegram.org/bot123456789:SECRET_TOKEN/getUpdates";
    for (const err of [new Error(raw), new TelegramProvisioningError(raw), { code: raw }]) {
      const result = safeGrowthTelegramPairingFailureCode(err);
      expect(result).toBe("UNEXPECTED_LOCAL_ERROR");
      expect(result).not.toContain("SECRET_TOKEN");
    }
  });
  it("surfaces existing private recipient file without exposing file paths", () => {
    expect(safeGrowthTelegramPairingFailureCode(
      Object.assign(new Error("/home/user/.config/saytwist/telegram-private-chat-id"), {
        code: "EEXIST",
      }),
    )).toBe("PRIVATE_RECIPIENT_FILE_ALREADY_EXISTS");
  });
});
