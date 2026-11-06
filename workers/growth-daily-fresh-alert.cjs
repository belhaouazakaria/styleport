/* eslint-disable @typescript-eslint/no-require-imports */
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { senderAddress } = require("./growth-lease-watchdog-alert.cjs");

const APP = "/home/saytwist/htdocs/saytwist.com";
const STATE_DIR = "/var/lib/saytwist-growth-daily-fresh";
const API = "https://api.brevo.com/v3/smtp/email";
const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const COOLDOWN_MS = 24 * 60 * 60_000;

async function sendDailyFreshAlert({
  env = process.env,
  username = os.userInfo().username,
  uid = process.getuid?.(),
  cwd = process.cwd(),
  now = Date.now(),
  read = fs.readFileSync,
  write = fs.writeFileSync,
  fetcher = fetch,
} = {}) {
  if (env.GROWTH_DAILY_FRESH_ALERT_ENABLED !== "true") return "DISABLED";
  if (username !== "saytwist" || uid === 0 || cwd !== APP ||
      env.NODE_ENV !== "production" || env.STATE_DIRECTORY !== STATE_DIR) {
    throw Error("FRESH_ALERT_IDENTITY_INVALID");
  }
  const key = env.BREVO_API_KEY || "";
  const recipient = env.ALERT_ADMIN_EMAIL || "";
  if (key.length < 8 || key.length > 2048 || !EMAIL.test(recipient)) {
    throw Error("FRESH_ALERT_CONFIG_INVALID");
  }
  const sender = senderAddress(env.EMAIL_FROM || "");
  const stamp = path.join(STATE_DIR, "last-alert-at");
  let prior = null;
  try {
    const value = read(stamp, "utf8").trim();
    if (!/^\d{13}$/.test(value)) throw Error("STAMP_INVALID");
    prior = Number(value);
  } catch (error) {
    if (error?.code !== "ENOENT") throw Error("STATE_INVALID");
  }
  if (prior !== null && now >= prior && now - prior < COOLDOWN_MS) {
    return "SUPPRESSED";
  }
  write(stamp, String(now) + "\n", { mode: 0o600 });
  let response;
  try {
    response = await fetcher(API, {
      method: "POST", redirect: "error", cache: "no-store",
      headers: { "api-key": key, Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        sender, to: [{ email: recipient }],
        subject: "SayTwist daily fresh creative preparation blocked",
        textContent: [
          "The daily deterministic Pinterest creative preparation failed.",
          "No automatic Pin approval or publication is performed by this worker.",
          "Verify Growth remains OFF and the temporary activation lease is NULL.",
          "Review scheduled publisher, watchdog, daily queue and candidate states.",
          "Check systemctl status saytwist-growth-daily-fresh.service.",
          "Check journalctl -u saytwist-growth-daily-fresh.service.",
          "Retain all existing candidates and audit history before any recovery.",
          "This alert is rate-limited to one submission attempt per 24 hours.",
        ].join("\n"),
      }),
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    throw Error("SUBMISSION_UNKNOWN");
  }
  if (!response?.ok) throw Error("SUBMISSION_NOT_CONFIRMED");
  return "SUBMITTED";
}

if (require.main === module) {
  sendDailyFreshAlert().then(result => {
    process.stdout.write("GROWTH_DAILY_FRESH_ALERT=" + result + "\n");
  }).catch(() => {
    process.stderr.write("GROWTH_DAILY_FRESH_ALERT=ERROR\n");
    process.exitCode = 1;
  });
}
module.exports = { sendDailyFreshAlert };
