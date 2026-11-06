/* eslint-disable @typescript-eslint/no-require-imports */
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { senderAddress } = require("./growth-lease-watchdog-alert.cjs");

const APP = "/home/saytwist/htdocs/saytwist.com";
const STATE_DIR = "/var/lib/saytwist-growth-approved-publisher";
const API = "https://api.brevo.com/v3/smtp/email";
const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const COOLDOWN_MS = 6 * 60 * 60_000;

async function sendPublisherAlert({
  env = process.env,
  username = os.userInfo().username,
  uid = process.getuid?.(),
  cwd = process.cwd(),
  now = Date.now(),
  read = fs.readFileSync,
  write = fs.writeFileSync,
  fetcher = fetch,
} = {}) {
  if (env.GROWTH_APPROVED_PUBLISHER_ALERT_ENABLED !== "true") return "DISABLED";
  if (username !== "saytwist" || uid === 0 || cwd !== APP ||
      env.NODE_ENV !== "production" || env.STATE_DIRECTORY !== STATE_DIR) {
    throw Error("PUBLISHER_ALERT_IDENTITY_INVALID");
  }
  const key = env.BREVO_API_KEY || "";
  const recipient = env.ALERT_ADMIN_EMAIL || "";
  if (key.length < 8 || key.length > 2048 || !EMAIL.test(recipient)) {
    throw Error("PUBLISHER_ALERT_CONFIG_INVALID");
  }
  const sender = senderAddress(env.EMAIL_FROM || "");
  const stamp = path.join(STATE_DIR, "last-alert-at");
  let prior = null;
  try {
    const val = read(stamp, "utf8").trim();
    if (!/^\d{13}$/.test(val)) throw Error("STATE_INVALID");
    prior = Number(val);
  } catch (error) {
    if (error?.code !== "ENOENT") throw Error("STATE_INVALID");
  }
  if (prior !== null && now >= prior && now - prior < COOLDOWN_MS) return "SUPPRESSED";
  // Reserve before attempting delivery: an ambiguous network outcome must not fan out.
  write(stamp, String(now) + "\n", { mode: 0o600 });
  let response;
  try {
    response = await fetcher(API, {
      method: "POST", redirect: "error", cache: "no-store",
      headers: { "api-key": key, Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        sender, to: [{ email: recipient }],
        subject: "SayTwist approved Pinterest publisher blocked: review required",
        textContent: [
          "The bounded scheduled publisher failed or blocked.",
          "No automatic retry of an uncertain Pinterest Create Pin outcome is permitted.",
          "Review the specific approved publication and its stored job status.",
          "Verify the global Growth activation lease is NULL and Growth is OFF.",
          "Inspect systemctl status saytwist-growth-approved-publisher.service.",
          "Inspect journalctl -u saytwist-growth-approved-publisher.service.",
          "Do not resume without checking quota, reconciliation and watchdog health.",
          "Alert attempts are limited to once every six hours.",
        ].join("\n"),
      }),
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    throw Error("ALERT_SUBMISSION_UNKNOWN");
  }
  if (!response?.ok) throw Error("ALERT_SUBMISSION_UNCONFIRMED");
  return "SUBMITTED";
}

if (require.main === module) {
  sendPublisherAlert().then(result => {
    process.stdout.write("GROWTH_APPROVED_PUBLISHER_ALERT=" + result + "\n");
  }).catch(() => {
    process.stderr.write("GROWTH_APPROVED_PUBLISHER_ALERT=ERROR\n");
    process.exitCode = 1;
  });
}
module.exports = { sendPublisherAlert };
