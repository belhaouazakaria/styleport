/**
 * OpenWA v5 Easy API transport for ONE operator-owned daily Growth digest.
 *
 * It does not start the WhatsApp runtime, link an account or schedule a send.
 * HTTP submission is NOT a delivery/read receipt. Unknown outcomes MUST be
 * investigated in the recipient chat before any manual re-send.
 */
export interface OpenWaReportSettings {
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
  recipientChatId: string;
}

export class OpenWaReportError extends Error {
  constructor(readonly code: string, readonly outcome: "NOT_SENT" | "UNKNOWN") {
    super(`OpenWA report transport: ${code}`);
    this.name = "OpenWaReportError";
  }
}

export function getOpenWaReportSettings(source: Record<string, string | undefined> = process.env): OpenWaReportSettings {
  const enabled = source.OPENWA_REPORTS_ENABLED === "true";
  const baseUrl = source.OPENWA_API_URL || "";
  const apiKey = source.OPENWA_API_KEY || "";
  const recipientChatId = source.OPENWA_REPORT_RECIPIENT || "";

  // Do not ever accept a caller-supplied public URL. The WhatsApp-control API
  // must remain bound to the local VPS loopback address only.
  const parsed = (() => { try { return new URL(baseUrl); } catch { return null; } })();
  if (enabled && (
    !parsed ||
    parsed.protocol !== "http:" ||
    parsed.hostname !== "127.0.0.1" ||
    !parsed.port ||
    parsed.pathname !== "/" ||
    parsed.search !== "" ||
    parsed.hash !== "" ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    apiKey.length < 32 ||
    apiKey.length > 512 ||
    !/^[1-9][0-9]{6,14}@c\.us$/.test(recipientChatId)
  )) {
    throw new OpenWaReportError("INVALID_CONFIGURATION", "NOT_SENT");
  }
  return { enabled, baseUrl: parsed?.origin ?? baseUrl, apiKey, recipientChatId };
}

export async function submitOpenWaDailyReport(
  message: string,
  config: OpenWaReportSettings = getOpenWaReportSettings(),
  fetcher: typeof fetch = fetch,
): Promise<{ submitted: true; messageId: string }> {
  if (!config.enabled) throw new OpenWaReportError("DISABLED", "NOT_SENT");
  // Revalidate even when a config object is injected by a test or service.
  const validated = getOpenWaReportSettings({
    OPENWA_REPORTS_ENABLED: "true",
    OPENWA_API_URL: config.baseUrl,
    OPENWA_API_KEY: config.apiKey,
    OPENWA_REPORT_RECIPIENT: config.recipientChatId,
  });

  if (!message.trim() || message.length > 3500 || /[\u0000-\u0008\u000B-\u001F\u007F]/.test(message)) {
    throw new OpenWaReportError("INVALID_MESSAGE", "NOT_SENT");
  }

  let health: Response;
  try {
    health = await fetcher(`${validated.baseUrl}/health`, {
      method: "GET",
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    throw new OpenWaReportError("HEALTH_UNREACHABLE", "NOT_SENT");
  }
  if (!health.ok) throw new OpenWaReportError("HEALTH_UNAVAILABLE", "NOT_SENT");
  let state: unknown;
  try {
    state = await health.json();
  } catch {
    throw new OpenWaReportError("HEALTH_INVALID", "NOT_SENT");
  }
  if (!state || typeof state !== "object" || !("connected" in state) ||
    state.connected !== true || !("session" in state) ||
    !state.session || typeof state.session !== "object" ||
    !("ready" in state.session) || state.session.ready !== true) {
    throw new OpenWaReportError("SESSION_NOT_READY", "NOT_SENT");
  }

  // Never automatically retry this call. HTTP timeout or malformed response may
  // mean WhatsApp already accepted the message.
  let response: Response;
  try {
    response = await fetcher(`${validated.baseUrl}/api/messages/sendText`, {
      method: "POST",
      redirect: "error",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": validated.apiKey,
      },
      body: JSON.stringify({ to: validated.recipientChatId, content: message, options: {} }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new OpenWaReportError("SUBMISSION_OUTCOME_UNKNOWN", "UNKNOWN");
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new OpenWaReportError("SUBMISSION_OUTCOME_UNKNOWN", "UNKNOWN");
  }
  if (response.ok && payload && typeof payload === "object" && "success" in payload &&
    payload.success === true && "data" in payload &&
    typeof payload.data === "string" && payload.data.length > 0 && payload.data.length <= 512) {
    return { submitted: true, messageId: payload.data };
  }

  // The remote API may explicitly report "not_sent", but a generic HTTP error
  // is not sufficient evidence of non-delivery. Preserve UNKNOWN in that case.
  throw new OpenWaReportError("SUBMISSION_NOT_CONFIRMED", "UNKNOWN");
}
