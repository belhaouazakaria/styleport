import { getServerEnv } from "@/lib/env";
import { logError, logWarn } from "@/lib/logger";

const RESEND_API_URL = "https://api.resend.com/emails";

export interface EmergencyAlertPayload {
  to: string;
  reason: string;
  triggeredAt: string;
  tokenUsage: number;
  tokenCap: number;
  topTranslators: Array<{
    name: string;
    slug: string;
    totalTokens: number;
    requestCount: number;
  }>;
}

export interface EmailSendResult {
  sent: boolean;
  error?: string;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function buildTextBody(payload: EmergencyAlertPayload): string {
  const translatorSummary = payload.topTranslators.length
    ? payload.topTranslators
        .map(
          (item, index) =>
            `${index + 1}. ${item.name} (/translators/${item.slug}) - ${item.totalTokens} tokens, ${item.requestCount} requests`,
        )
        .join("\n")
    : "No translator usage data available for this UTC day.";

  return [
    "StylePort Emergency Shutdown Alert",
    "",
    `Reason: ${payload.reason}`,
    `Triggered at (UTC): ${payload.triggeredAt}`,
    `Total tokens today: ${payload.tokenUsage}`,
    `Configured token cap: ${payload.tokenCap}`,
    "",
    "Top translators by token usage:",
    translatorSummary,
    "",
    "Action required:",
    "Review Usage Protection in /admin/usage-protection and manually re-enable translations when safe.",
  ].join("\n");
}

function buildHtmlBody(payload: EmergencyAlertPayload): string {
  const rows = payload.topTranslators.length
    ? payload.topTranslators
        .map(
          (item) => `
            <tr>
              <td style="padding:8px 10px;border-bottom:1px solid #E5E7EB;">${escapeHtml(item.name)}</td>
              <td style="padding:8px 10px;border-bottom:1px solid #E5E7EB;">/${escapeHtml(item.slug)}</td>
              <td style="padding:8px 10px;border-bottom:1px solid #E5E7EB;text-align:right;">${item.totalTokens}</td>
              <td style="padding:8px 10px;border-bottom:1px solid #E5E7EB;text-align:right;">${item.requestCount}</td>
            </tr>
          `,
        )
        .join("")
    : `
      <tr>
        <td colspan="4" style="padding:10px;border-bottom:1px solid #E5E7EB;color:#6B7280;">
          No translator usage data available for this UTC day.
        </td>
      </tr>
    `;

  return `
    <div style="font-family:Inter,Segoe UI,Arial,sans-serif;color:#111827;max-width:640px;margin:0 auto;">
      <h1 style="margin:0 0 12px;font-size:20px;">StylePort Emergency Shutdown Alert</h1>
      <p style="margin:0 0 8px;"><strong>Reason:</strong> ${escapeHtml(payload.reason)}</p>
      <p style="margin:0 0 8px;"><strong>Triggered at (UTC):</strong> ${escapeHtml(payload.triggeredAt)}</p>
      <p style="margin:0 0 8px;"><strong>Total tokens today:</strong> ${payload.tokenUsage}</p>
      <p style="margin:0 0 16px;"><strong>Configured token cap:</strong> ${payload.tokenCap}</p>

      <h2 style="font-size:16px;margin:18px 0 8px;">Top translators by token usage</h2>
      <table style="width:100%;border-collapse:collapse;border:1px solid #E5E7EB;border-radius:8px;overflow:hidden;">
        <thead>
          <tr style="background:#F7F8FC;color:#111827;text-align:left;">
            <th style="padding:8px 10px;border-bottom:1px solid #E5E7EB;">Translator</th>
            <th style="padding:8px 10px;border-bottom:1px solid #E5E7EB;">Slug</th>
            <th style="padding:8px 10px;border-bottom:1px solid #E5E7EB;text-align:right;">Tokens</th>
            <th style="padding:8px 10px;border-bottom:1px solid #E5E7EB;text-align:right;">Requests</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>

      <p style="margin:18px 0 0;color:#6B7280;">
        Review <strong>/admin/usage-protection</strong> and manually re-enable translations when safe.
      </p>
    </div>
  `;
}

export async function sendEmergencyShutdownAlertEmail(
  payload: EmergencyAlertPayload,
): Promise<EmailSendResult> {
  const env = getServerEnv();
  const apiKey = env.RESEND_API_KEY;
  const from = env.EMAIL_FROM;

  if (!apiKey) {
    logWarn("email_alert_missing_key", "RESEND_API_KEY is missing; alert email was not sent.");
    return { sent: false, error: "Missing RESEND_API_KEY." };
  }

  if (!from) {
    logWarn("email_alert_missing_from", "EMAIL_FROM is missing; alert email was not sent.");
    return { sent: false, error: "Missing EMAIL_FROM." };
  }

  try {
    const response = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [payload.to],
        subject: "StylePort emergency shutdown: global token cap reached",
        text: buildTextBody(payload),
        html: buildHtmlBody(payload),
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      logWarn("email_alert_http_error", "Resend returned a non-OK response.", {
        status: response.status,
      });
      return {
        sent: false,
        error: body || `Resend request failed with status ${response.status}.`,
      };
    }

    return { sent: true };
  } catch (error) {
    logError("email_alert_send_error", "Unexpected error while sending shutdown alert email.", undefined, error);
    return {
      sent: false,
      error: error instanceof Error ? error.message : "Unknown email error.",
    };
  }
}
