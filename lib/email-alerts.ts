import { getServerEnv } from "@/lib/env";
import { logError, logWarn } from "@/lib/logger";

const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DISPLAY_EMAIL_PATTERN = /^(.+?)<\s*([^\s@]+@[^\s@]+\.[^\s@]+)\s*>$/;
const DEFAULT_SENDER_NAME = "What Type Of | Translator";

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

export interface ContactMessagePayload {
  name: string;
  email: string;
  message: string;
}

export interface TranslatorRequestVerificationEmailPayload {
  to: string;
  requestedName: string;
  verificationUrl: string;
}

export interface TranslatorPublishedEmailPayload {
  to: string;
  requestedName: string;
  translatorName: string;
  translatorUrl: string;
}

interface BrevoAddress {
  email: string;
  name?: string;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function parseEmailAddress(value: string): BrevoAddress | null {
  const trimmed = value.trim();

  const displayMatch = trimmed.match(DISPLAY_EMAIL_PATTERN);
  if (displayMatch) {
    const name = displayMatch[1]?.trim();
    const email = displayMatch[2]?.trim().toLowerCase();
    if (email && EMAIL_PATTERN.test(email)) {
      return {
        email,
        ...(name ? { name } : {}),
      };
    }
    return null;
  }

  if (EMAIL_PATTERN.test(trimmed)) {
    return { email: trimmed.toLowerCase() };
  }

  return null;
}

function parseConfiguredSender(value: string): BrevoAddress | null {
  const parsed = parseEmailAddress(value);
  if (!parsed) {
    return null;
  }

  return {
    email: parsed.email,
    name: parsed.name || DEFAULT_SENDER_NAME,
  };
}

async function sendBrevoEmail(params: {
  apiKey: string;
  sender: BrevoAddress;
  to: string[];
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
}): Promise<{ ok: true } | { ok: false; status?: number; error: string }> {
  const recipients = params.to.map((value) => parseEmailAddress(value)).filter(Boolean) as BrevoAddress[];
  if (!recipients.length || recipients.length !== params.to.length) {
    return { ok: false, error: "Invalid recipient email address." };
  }

  const replyTo = params.replyTo ? parseEmailAddress(params.replyTo) : undefined;
  if (params.replyTo && !replyTo) {
    return { ok: false, error: "Invalid reply-to email address." };
  }

  try {
    const response = await fetch(BREVO_API_URL, {
      method: "POST",
      headers: {
        accept: "application/json",
        "api-key": params.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sender: params.sender,
        to: recipients,
        ...(replyTo ? { replyTo } : {}),
        subject: params.subject,
        textContent: params.text,
        htmlContent: params.html,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return {
        ok: false,
        status: response.status,
        error: body || `Brevo request failed with status ${response.status}.`,
      };
    }

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unknown email transport error.",
    };
  }
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
    "What Type Of | Translator Emergency Shutdown Alert",
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
      <h1 style="margin:0 0 12px;font-size:20px;">What Type Of | Translator Emergency Shutdown Alert</h1>
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
  const apiKey = env.BREVO_API_KEY;
  const from = env.EMAIL_FROM;

  if (!apiKey) {
    logWarn("email_alert_missing_key", "BREVO_API_KEY is missing; alert email was not sent.");
    return { sent: false, error: "Missing BREVO_API_KEY." };
  }

  if (!from) {
    logWarn("email_alert_missing_from", "EMAIL_FROM is missing; alert email was not sent.");
    return { sent: false, error: "Missing EMAIL_FROM." };
  }

  const sender = parseConfiguredSender(from);
  if (!sender) {
    logWarn("email_alert_invalid_from", "EMAIL_FROM is invalid; alert email was not sent.");
    return { sent: false, error: "Invalid EMAIL_FROM format." };
  }

  const response = await sendBrevoEmail({
    apiKey,
    sender,
    to: [payload.to],
    subject: "What Type Of | Translator emergency shutdown: global token cap reached",
    text: buildTextBody(payload),
    html: buildHtmlBody(payload),
  });

  if (!response.ok) {
    if (typeof response.status === "number") {
      logWarn("email_alert_http_error", "Brevo returned a non-OK response.", {
        status: response.status,
      });
    } else {
      logError("email_alert_send_error", "Unexpected error while sending shutdown alert email.");
    }
    return { sent: false, error: response.error };
  }

  return { sent: true };
}

export async function sendContactMessageEmail(payload: ContactMessagePayload): Promise<EmailSendResult> {
  const env = getServerEnv();
  const apiKey = env.BREVO_API_KEY;
  const from = env.EMAIL_FROM;
  const to = env.ALERT_ADMIN_EMAIL?.trim();

  if (!apiKey) {
    logWarn("contact_email_missing_key", "BREVO_API_KEY is missing; contact email was not sent.");
    return { sent: false, error: "Missing BREVO_API_KEY." };
  }

  if (!from) {
    logWarn("contact_email_missing_from", "EMAIL_FROM is missing; contact email was not sent.");
    return { sent: false, error: "Missing EMAIL_FROM." };
  }

  if (!to) {
    logWarn("contact_email_missing_recipient", "ALERT_ADMIN_EMAIL is missing; contact email was not sent.");
    return { sent: false, error: "Missing ALERT_ADMIN_EMAIL." };
  }

  const sender = parseConfiguredSender(from);
  if (!sender) {
    logWarn("contact_email_invalid_from", "EMAIL_FROM is invalid; contact email was not sent.");
    return { sent: false, error: "Invalid EMAIL_FROM format." };
  }

  const safeName = escapeHtml(payload.name);
  const safeEmail = escapeHtml(payload.email);
  const safeMessage = escapeHtml(payload.message).replaceAll("\n", "<br/>");

  const response = await sendBrevoEmail({
    apiKey,
    sender,
    to: [to],
    replyTo: payload.email,
    subject: `What Type Of | Translator contact message from ${payload.name}`,
    text: [
      "New contact message received.",
      "",
      `Name: ${payload.name}`,
      `Email: ${payload.email}`,
      "",
      "Message:",
      payload.message,
    ].join("\n"),
    html: `
      <div style="font-family:Inter,Segoe UI,Arial,sans-serif;color:#111827;max-width:640px;margin:0 auto;">
        <h1 style="margin:0 0 12px;font-size:20px;">New contact message</h1>
        <p style="margin:0 0 8px;"><strong>Name:</strong> ${safeName}</p>
        <p style="margin:0 0 8px;"><strong>Email:</strong> ${safeEmail}</p>
        <p style="margin:0 0 6px;"><strong>Message:</strong></p>
        <p style="margin:0;color:#374151;line-height:1.65;">${safeMessage}</p>
      </div>
    `,
  });

  if (!response.ok) {
    if (typeof response.status === "number") {
      logWarn("contact_email_http_error", "Brevo returned non-OK for contact email.", {
        status: response.status,
      });
    } else {
      logError("contact_email_send_error", "Unexpected error while sending contact email.");
    }
    return { sent: false, error: response.error };
  }

  return { sent: true };
}

export async function sendTranslatorRequestVerificationEmail(
  payload: TranslatorRequestVerificationEmailPayload,
): Promise<EmailSendResult> {
  const env = getServerEnv();
  const apiKey = env.BREVO_API_KEY;
  const from = env.EMAIL_FROM;

  if (!apiKey) {
    logWarn("request_verify_email_missing_key", "BREVO_API_KEY is missing; verification email was not sent.");
    return { sent: false, error: "Missing BREVO_API_KEY." };
  }

  if (!from) {
    logWarn("request_verify_email_missing_from", "EMAIL_FROM is missing; verification email was not sent.");
    return { sent: false, error: "Missing EMAIL_FROM." };
  }

  const sender = parseConfiguredSender(from);
  if (!sender) {
    logWarn("request_verify_email_invalid_from", "EMAIL_FROM is invalid; verification email was not sent.");
    return { sent: false, error: "Invalid EMAIL_FROM format." };
  }

  const safeName = escapeHtml(payload.requestedName);
  const safeUrl = escapeHtml(payload.verificationUrl);

  const response = await sendBrevoEmail({
    apiKey,
    sender,
    to: [payload.to],
    subject: "Confirm your What Type Of | Translator idea",
    text: [
      `Thanks for submitting your translator idea: ${payload.requestedName}`,
      "",
      "Please confirm your email by clicking this one-time link:",
      payload.verificationUrl,
      "",
      "This link expires in 24 hours.",
      "If you do not see future updates from us, please check your spam/junk folder.",
    ].join("\n"),
    html: `
      <div style="font-family:Inter,Segoe UI,Arial,sans-serif;color:#111827;max-width:640px;margin:0 auto;">
        <h1 style="margin:0 0 12px;font-size:20px;">Confirm your email</h1>
        <p style="margin:0 0 10px;line-height:1.6;">
          Thanks for sharing your translator idea:
          <strong>${safeName}</strong>
        </p>
        <p style="margin:0 0 14px;line-height:1.6;">
          Please confirm your email address so we can notify you if this translator is approved and goes live.
        </p>
        <p style="margin:0 0 16px;">
          <a href="${safeUrl}" style="display:inline-block;background:#4F46E5;color:#fff;text-decoration:none;padding:10px 14px;border-radius:10px;font-weight:600;">
            Verify Email
          </a>
        </p>
        <p style="margin:0 0 8px;line-height:1.6;color:#4B5563;">
          If the button does not work, copy this link into your browser:
        </p>
        <p style="margin:0;word-break:break-all;color:#374151;">${safeUrl}</p>
        <p style="margin:16px 0 0;color:#6B7280;">This link expires in 24 hours.</p>
      </div>
    `,
  });

  if (!response.ok) {
    if (typeof response.status === "number") {
      logWarn("request_verify_email_http_error", "Brevo returned non-OK for verification email.", {
        status: response.status,
      });
    } else {
      logError("request_verify_email_send_error", "Unexpected error while sending verification email.");
    }
    return { sent: false, error: response.error };
  }

  return { sent: true };
}

export async function sendTranslatorPublishedEmail(
  payload: TranslatorPublishedEmailPayload,
): Promise<EmailSendResult> {
  const env = getServerEnv();
  const apiKey = env.BREVO_API_KEY;
  const from = env.EMAIL_FROM;

  if (!apiKey) {
    logWarn("request_publish_email_missing_key", "BREVO_API_KEY is missing; publish email was not sent.");
    return { sent: false, error: "Missing BREVO_API_KEY." };
  }

  if (!from) {
    logWarn("request_publish_email_missing_from", "EMAIL_FROM is missing; publish email was not sent.");
    return { sent: false, error: "Missing EMAIL_FROM." };
  }

  const sender = parseConfiguredSender(from);
  if (!sender) {
    logWarn("request_publish_email_invalid_from", "EMAIL_FROM is invalid; publish email was not sent.");
    return { sent: false, error: "Invalid EMAIL_FROM format." };
  }

  const safeRequestedName = escapeHtml(payload.requestedName);
  const safeTranslatorName = escapeHtml(payload.translatorName);
  const safeUrl = escapeHtml(payload.translatorUrl);

  const response = await sendBrevoEmail({
    apiKey,
    sender,
    to: [payload.to],
    subject: `Your translator idea is now live: ${payload.translatorName}`,
    text: [
      "Great news, your translator idea is now live on What Type Of | Translator.",
      "",
      `Your idea: ${payload.requestedName}`,
      `Live translator: ${payload.translatorName}`,
      `Open it: ${payload.translatorUrl}`,
      "",
      "If you like it, feel free to share it with your friends.",
      "Thanks for helping us improve the platform.",
    ].join("\n"),
    html: `
      <div style="font-family:Inter,Segoe UI,Arial,sans-serif;color:#111827;max-width:640px;margin:0 auto;">
        <h1 style="margin:0 0 12px;font-size:20px;">Your translator is live</h1>
        <p style="margin:0 0 10px;line-height:1.6;">
          Thanks again for your idea: <strong>${safeRequestedName}</strong>
        </p>
        <p style="margin:0 0 14px;line-height:1.6;">
          We published it as <strong>${safeTranslatorName}</strong>.
        </p>
        <p style="margin:0;">
          <a href="${safeUrl}" style="display:inline-block;background:#4F46E5;color:#fff;text-decoration:none;padding:10px 14px;border-radius:10px;font-weight:600;">
            Try this translator
          </a>
        </p>
        <p style="margin:14px 0 0;line-height:1.6;color:#4B5563;">
          If you like it, share it with your friends.
        </p>
      </div>
    `,
  });

  if (!response.ok) {
    if (typeof response.status === "number") {
      logWarn("request_publish_email_http_error", "Brevo returned non-OK for publish email.", {
        status: response.status,
      });
    } else {
      logError("request_publish_email_send_error", "Unexpected error while sending publish email.");
    }
    return { sent: false, error: response.error };
  }

  return { sent: true };
}
