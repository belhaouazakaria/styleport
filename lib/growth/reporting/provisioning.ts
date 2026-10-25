/**
 * Read-only Telegram provisioning checks. This never sends a message,
 * polls in a loop, starts a webhook, or modifies recipient state.
 */
import { getTelegramReportSettings } from "@/lib/growth/reporting/telegram";

export class TelegramProvisioningError extends Error {
  constructor(readonly code: string) {
    super("Telegram provisioning: " + code);
    this.name = "TelegramProvisioningError";
  }
}

async function readBotApi(
  botToken: string, method: "getMe" | "getChat",
  body: Record<string, string>,
  fetcher: typeof fetch,
): Promise<Record<string, unknown>> {
  const url = "https://api.telegram.org/bot" + botToken + "/" + method;
  let response: Response;
  try {
    response = await fetcher(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    throw new TelegramProvisioningError("NETWORK_OR_TIMEOUT");
  }
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new TelegramProvisioningError("INVALID_RESPONSE");
  }
  if (!response.ok || !data || typeof data !== "object" ||
      !("ok" in data) || data.ok !== true || !("result" in data) ||
      !data.result || typeof data.result !== "object") {
    // Never expose HTTP response JSON; Telegram may include identifying info.
    throw new TelegramProvisioningError(method === "getMe"
      ? "TOKEN_NOT_VERIFIED" : "PRIVATE_CHAT_NOT_VERIFIED");
  }
  return data.result as Record<string, unknown>;
}

/** Caller controls when to perform these two read-only HTTPS requests. */
export async function verifyGrowthTelegramProvisioning(
  configSource: Record<string, string | undefined> = process.env,
  fetcher: typeof fetch = fetch,
) {
  // A private operator may run the checker while live reporting remains OFF.
  // The strict token/chat shape validator is reused, but this method never
  // enables TELEGRAM_REPORTS_ENABLED in the environment or sends a message.
  const settings = getTelegramReportSettings({
    TELEGRAM_REPORTS_ENABLED: "true",
    TELEGRAM_BOT_TOKEN: configSource.TELEGRAM_BOT_TOKEN,
    TELEGRAM_REPORT_CHAT_ID: configSource.TELEGRAM_REPORT_CHAT_ID,
  });
  const me = await readBotApi(settings.botToken, "getMe", {}, fetcher);
  if (me.is_bot !== true || typeof me.username !== "string" ||
      !/^[a-zA-Z0-9_]{5,32}$/.test(me.username)) {
    throw new TelegramProvisioningError("BOT_IDENTITY_NOT_VERIFIED");
  }
  const chat = await readBotApi(
    settings.botToken, "getChat", { chat_id: settings.chatId }, fetcher,
  );
  if (chat.type !== "private" || String(chat.id) !== settings.chatId) {
    throw new TelegramProvisioningError("NOT_INTENDED_PRIVATE_CHAT");
  }
  return { botVerified: true as const, privateRecipientVerified: true as const };
}
