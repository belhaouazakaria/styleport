/* eslint-disable @typescript-eslint/no-require-imports */
"use strict";
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { senderAddress } = require("./growth-lease-watchdog-alert.cjs");

const APP = "/home/saytwist/htdocs/saytwist.com";
const STATE_DIR = "/var/lib/saytwist-growth-report";
const API_URL = "https://api.brevo.com/v3/smtp/email";
const COOLDOWN_MS = 24 * 60 * 60 * 1000;
const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

async function sendAutonomousReportAlert({
  env = process.env,
  username = os.userInfo().username,
  uid = process.getuid?.(),
  cwd = process.cwd(),
  now = Date.now(),
  read = fs.readFileSync,
  write = fs.writeFileSync,
  fetcher = fetch,
} = {}) {
  if (env.GROWTH_AUTONOMOUS_REPORT_ALERT_ENABLED !== "true") return "DISABLED";
  if (username !== "saytwist" || uid === 0 || cwd !== APP ||
      env.NODE_ENV !== "production" || env.STATE_DIRECTORY !== STATE_DIR) {
    throw Error("RUNTIME_INVALID");
  }
  const key = env.BREVO_API_KEY || "";
  const recipient = env.ALERT_ADMIN_EMAIL || "";
  if (key.length < 8 || key.length > 2048 || !EMAIL.test(recipient)) {
    throw Error("CONFIG_INVALID");
  }
  const sender = senderAddress(env.EMAIL_FROM || "");
  const stamp = path.join(STATE_DIR, "last-alert-at");
  let prior = null;
  try {
    const val = read(stamp, "utf8").trim();
    if (!/^\d{13}$/.test(val)) throw Error("STAMP_INVALID");
    prior = Number(val);
  } catch (error) {
    if (error?.code !== "ENOENT") throw Error("STATE_INVALID");
  }
  if (prior !== null && now >= prior && now - prior < COOLDOWN_MS) return "SUPPRESSED";
  // Reserve before sending to avoid email fan-out on ambiguous network outcomes.
  write(stamp, String(now) + "\n", { mode: 0o600 });
  let response;
  try {
    response = await fetcher(API_URL, {
      method: "POST", redirect: "error", cache: "no-store",
      headers: { "api-key": key, Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        sender, to: [{ email: recipient }],
        subject: "SayTwist private Growth report failed: review required",
        textContent: [
          "The approved private daily Growth report was blocked or may have an unknown delivery outcome. Do not retry until the delivery ledger is reviewed.",
          "No automatic retry should be attempted.",
          "Verify Growth remains OFF and the activation lease is NULL.",
          "Check systemctl status saytwist-growth-report.service",
          "and journalctl -u saytwist-growth-report.service.",
          "Confirm watchdog health before any other Growth activity.",
          "This alert is rate limited to one attempt per 24 hours.",
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
  sendAutonomousReportAlert().then(result => {
    process.stdout.write("GROWTH_REPORT_ALERT=" + result + "\n");
  }).catch(() => {
    process.stderr.write("GROWTH_REPORT_ALERT=ERROR\n");
    process.exitCode = 1;
  });
}
module.exports = { sendAutonomousReportAlert };
