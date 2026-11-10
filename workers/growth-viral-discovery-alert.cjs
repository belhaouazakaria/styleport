/* eslint-disable @typescript-eslint/no-require-imports */
"use strict";
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { senderAddress } = require("./growth-lease-watchdog-alert.cjs");

const APP = "/home/saytwist/htdocs/saytwist.com";
const STATE_DIR = "/var/lib/saytwist-growth-viral-discovery";
const API = "https://api.brevo.com/v3/smtp/email";
const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const COOLDOWN = 24 * 60 * 60 * 1000;

async function sendViralDiscoveryAlert({
  env = process.env,
  username = os.userInfo().username,
  uid = process.getuid?.(),
  cwd = process.cwd(),
  now = Date.now(),
  read = fs.readFileSync,
  write = fs.writeFileSync,
  fetcher = fetch,
} = {}) {
  if (env.GROWTH_VIRAL_DISCOVERY_ALERT_ENABLED !== "true") return "DISABLED";
  if (username !== "saytwist" || uid === 0 || cwd !== APP ||
      env.NODE_ENV !== "production" || env.STATE_DIRECTORY !== STATE_DIR) {
    throw Error("DISCOVERY_ALERT_RUNTIME_INVALID");
  }
  const token = env.BREVO_API_KEY || "";
  const recipient = env.ALERT_ADMIN_EMAIL || "";
  if (token.length < 8 || token.length > 2048 || !EMAIL.test(recipient)) {
    throw Error("DISCOVERY_ALERT_CONFIG_INVALID");
  }
  const sender = senderAddress(env.EMAIL_FROM || "");
  const marker = path.join(STATE_DIR, "last-alert-at");
  let last = null;
  try {
    const value = read(marker, "utf8").trim();
    if (!/^\d{13}$/.test(value)) throw Error("DISCOVERY_ALERT_MARKER_INVALID");
    last = Number(value);
  } catch (error) {
    if (error?.code !== "ENOENT") throw Error("DISCOVERY_ALERT_MARKER_INVALID");
  }
  if (last !== null && now >= last && now - last < COOLDOWN) return "SUPPRESSED";
  // Reserve before network call. No automatic retry after an unknown outcome.
  write(marker, String(now) + "\n", { mode: 0o600 });
  let response;
  try {
    response = await fetcher(API, {
      method: "POST", redirect: "error", cache: "no-store",
      headers: { "api-key": token, Accept: "application/json",
        "Content-Type": "application/json" },
      body: JSON.stringify({
        sender, to: [{ email: recipient }],
        subject: "SayTwist daily source discovery blocked: review required",
        textContent: [
          "The scheduled review-only public translator discovery was blocked or failed.",
          "No automatic retry should be attempted today.",
          "No Pin publication or paid AI work is part of this schedule.",
          "Check systemctl status saytwist-growth-viral-discovery.service",
          "and journalctl -u saytwist-growth-viral-discovery.service.",
          "Verify Growth remains OFF and inspect the audit before re-enabling.",
          "This notice is limited to one attempt per 24 hours.",
        ].join("\n"),
      }),
      signal: AbortSignal.timeout(12_000),
    });
  } catch { throw Error("DISCOVERY_ALERT_DELIVERY_UNKNOWN"); }
  if (!response?.ok) throw Error("DISCOVERY_ALERT_DELIVERY_FAILED");
  return "SUBMITTED";
}
if (require.main === module) {
  sendViralDiscoveryAlert().then(result => {
    process.stdout.write("GROWTH_VIRAL_DISCOVERY_ALERT=" + result + "\n");
  }).catch(() => {
    process.stderr.write("GROWTH_VIRAL_DISCOVERY_ALERT=ERROR\n");
    process.exitCode = 1;
  });
}
module.exports = { sendViralDiscoveryAlert };
