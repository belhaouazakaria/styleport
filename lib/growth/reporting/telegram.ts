/**
 * Opt-in, one-recipient Telegram Bot API transport for archived Growth reports.
 * HTTP acceptance is not a read/delivery receipt. Ambiguous sends are never retried.
 */
export interface TelegramReportSettings {
  enabled: boolean;
  botToken: string;
  chatId: string;
}

export class TelegramReportError extends Error {
  constructor(readonly code: string, readonly outcome: "NOT_SENT" | "UNKNOWN") {
    super("Telegram report transport: " + code);
    this.name = "TelegramReportError";
  }
}

const BOT_API_HOST = "https://api.telegram.org";
const TOKEN_PATTERN = /^[1-9][0-9]{5,14}:[A-Za-z0-9_-]{30,}$/;
const PRIVATE_CHAT_PATTERN = /^[1-9][0-9]{4,15}$/;

export function getTelegramReportSettings(
  source: Record<string, string | undefined> = process.env,
): TelegramReportSettings {
  if (source.TELEGRAM_REPORTS_ENABLED !== "true") {
    return { enabled: false, botToken: "", chatId: "" };
  }
  const botToken = source.TELEGRAM_BOT_TOKEN ?? "";
  const chatId = source.TELEGRAM_REPORT_CHAT_ID ?? "";
  if (!TOKEN_PATTERN.test(botToken) || !PRIVATE_CHAT_PATTERN.test(chatId)) {
    // Never surface either credential in errors or logs.
    throw new TelegramReportError("INVALID_CONFIGURATION", "NOT_SENT");
  }
  return { enabled: true, botToken, chatId };
}

export async function submitTelegramDailyReport(
  message: string,
  config: TelegramReportSettings = getTelegramReportSettings(),
  fetcher: typeof fetch = fetch,
): Promise<{ submitted: true; messageId: string }> {
  if (!config.enabled) throw new TelegramReportError("DISABLED", "NOT_SENT");
  const validated = getTelegramReportSettings({
    TELEGRAM_REPORTS_ENABLED: "true",
    TELEGRAM_BOT_TOKEN: config.botToken,
    TELEGRAM_REPORT_CHAT_ID: config.chatId,
  });
  if (!message.trim() || message.length > 3500 ||
      /[\u0000-\u0008\u000b-\u001f\u007f]/.test(message)) {
    throw new TelegramReportError("INVALID_MESSAGE", "NOT_SENT");
  }

  // Telegram requires the token in the Bot API path. Never log the URL, errors
  // from fetch, HTTP response bodies, or request objects.
  const url = BOT_API_HOST + "/bot" + validated.botToken + "/sendMessage";
  let response: Response;
  try {
    response = await fetcher(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: validated.chatId,
        text: message,
        link_preview_options: { is_disabled: true },
      }),
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new TelegramReportError("SUBMISSION_OUTCOME_UNKNOWN", "UNKNOWN");
  }
  if (response.status === 429) {
    throw new TelegramReportError("RATE_LIMITED_OUTCOME_UNKNOWN", "UNKNOWN");
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new TelegramReportError("SUBMISSION_OUTCOME_UNKNOWN", "UNKNOWN");
  }
  if (!response.ok || !payload || typeof payload !== "object" ||
      !("ok" in payload) || payload.ok !== true ||
      !("result" in payload) || !payload.result || typeof payload.result !== "object") {
    throw new TelegramReportError("SUBMISSION_NOT_CONFIRMED", "UNKNOWN");
  }
  const data = payload.result as Record<string, unknown>;
  const chat = data.chat;
  if (typeof data.message_id !== "number" ||
      !Number.isSafeInteger(data.message_id) || data.message_id <= 0 ||
      !chat || typeof chat !== "object" || !("id" in chat) ||
      !("type" in chat) || String(chat.id) !== validated.chatId ||
      chat.type !== "private") {
    throw new TelegramReportError("SUBMISSION_NOT_CONFIRMED", "UNKNOWN");
  }
  return { submitted: true, messageId: String(data.message_id) };
}
