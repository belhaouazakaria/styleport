/**
 * One-time Telegram private chat pairing discovery. No messages are sent.
 * The operator sends /start <random-code> privately to the bot; a single
 * getUpdates snapshot matches only that code, not public/group traffic.
 */
import { getTelegramReportSettings } from "@/lib/growth/reporting/telegram";
import { TelegramProvisioningError } from "@/lib/growth/reporting/provisioning";

const BOT_TOKEN_PATTERN = /^[1-9][0-9]{5,14}:[A-Za-z0-9_-]{30,}$/;
const NONCE_PATTERN = /^[a-f0-9]{16,32}$/;
const PRIVATE_ID_PATTERN = /^[1-9][0-9]{4,15}$/;

export function findMatchedPrivateChatId(updates: unknown, pairingCode: string): string {
  if (!NONCE_PATTERN.test(pairingCode))
    throw new TelegramProvisioningError("INVALID_PAIRING_CODE");
  if (!Array.isArray(updates)) throw new TelegramProvisioningError("INVALID_UPDATES");
  const matches = new Set<string>();
  for (const item of updates) {
    if (!item || typeof item !== "object" || !("message" in item)) continue;
    const msg = item.message;
    if (!msg || typeof msg !== "object" ||
        !("chat" in msg) || !("text" in msg)) continue;
    const chat = msg.chat;
    if (msg.text !== "/start " + pairingCode ||
        !chat || typeof chat !== "object" ||
        !("type" in chat) || chat.type !== "private" ||
        !("id" in chat)) continue;
    const id = String(chat.id);
    if (PRIVATE_ID_PATTERN.test(id) && Number.isSafeInteger(Number(id))) matches.add(id);
  }
  if (!matches.size) throw new TelegramProvisioningError("PAIRING_MESSAGE_NOT_FOUND");
  if (matches.size !== 1) throw new TelegramProvisioningError("AMBIGUOUS_PRIVATE_RECIPIENT");
  return [...matches][0];
}

export async function discoverGrowthTelegramPrivateChat(
  env: Record<string, string | undefined> = process.env,
  fetcher: typeof fetch = fetch,
): Promise<string> {
  const token = env.TELEGRAM_BOT_TOKEN ?? "";
  const nonce = env.TELEGRAM_REPORT_PAIRING_CODE ?? "";
  if (!BOT_TOKEN_PATTERN.test(token) || !NONCE_PATTERN.test(nonce))
    throw new TelegramProvisioningError("INVALID_PAIRING_CONFIGURATION");
  // No webhook, no polling daemon, no offset/acknowledgment and no mutation.
  // Telegram exposes at most the most recent 100 queued updates; use a fresh
  // dedicated bot. Neither updates nor the token-bearing URL may be logged.
  let response: Response;
  try {
    response = await fetcher("https://api.telegram.org/bot" + token + "/getUpdates", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ limit: 100, timeout: 0, allowed_updates: ["message"] }),
      signal: AbortSignal.timeout(12_000), redirect: "error", cache: "no-store",
    });
  } catch {
    throw new TelegramProvisioningError("PAIRING_REQUEST_FAILED");
  }
  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new TelegramProvisioningError("INVALID_UPDATES_RESPONSE");
  }
  if (!response.ok || !json || typeof json !== "object" ||
      !("ok" in json) || json.ok !== true || !("result" in json)) {
    throw new TelegramProvisioningError("PAIRING_UPDATES_UNAVAILABLE");
  }
  return findMatchedPrivateChatId(json.result, nonce);
}
