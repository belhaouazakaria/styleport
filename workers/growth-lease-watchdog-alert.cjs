/* eslint-disable @typescript-eslint/no-require-imports -- Plain Node bootstrap independent of Next.js/PM2. */
"use strict";
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const APP = "/home/saytwist/htdocs/saytwist.com";
const STATE_DIR = "/var/lib/saytwist-growth-watchdog";
const API_URL = "https://api.brevo.com/v3/smtp/email";
const COOLDOWN_MS = 60 * 60 * 1000;
const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

function senderAddress(source) {
  const clean = source.trim();
  const match = /^([^<>]{1,80})<\s*([^\s<>@]+@[^\s<>@]+\.[^\s<>@]+)\s*>$/.exec(clean);
  if (match) {
    const name = match[1].trim();
    if (!name || !EMAIL.test(match[2])) throw new Error("CONFIG_INVALID");
    return { name, email: match[2] };
  }
  if (!EMAIL.test(clean)) throw new Error("CONFIG_INVALID");
  return { email: clean, name: "SayTwist" };
}

function configuration(env, username, cwd, uid) {
  if (username !== "saytwist" || uid === 0 ||
      cwd !== APP || env.NODE_ENV !== "production" ||
      env.STATE_DIRECTORY !== STATE_DIR) {
    throw new Error("RUNTIME_INVALID");
  }
  const key = env.BREVO_API_KEY || "";
  const recipient = env.ALERT_ADMIN_EMAIL || "";
  const from = env.EMAIL_FROM || "";
  if (key.length < 8 || key.length > 2048 || !EMAIL.test(recipient)) {
    throw new Error("CONFIG_INVALID");
  }
  return { key, recipient, sender: senderAddress(from) };
}

async function sendWatchdogFailureAlert({
  env = process.env,
  username = os.userInfo().username,
  cwd = process.cwd(),
  uid = process.getuid?.(),
  now = Date.now(),
  read = fs.readFileSync,
  write = fs.writeFileSync,
  fetcher = fetch,
} = {}) {
  if (env.GROWTH_WATCHDOG_ALERT_ENABLED !== "true") return "DISABLED";
  const cfg = configuration(env, username, cwd, uid);
  const stamp = path.join(STATE_DIR, "last-alert-at");
  let previous = null;
  try {
    const value = read(stamp, "utf8").trim();
    if (!/^\d{13}$/.test(value)) throw new Error("STAMP_INVALID");
    previous = Number(value);
  } catch (error) {
    if (error?.code !== "ENOENT") throw new Error("STATE_INVALID");
  }
  if (previous !== null && now >= previous && now - previous < COOLDOWN_MS) {
    return "SUPPRESSED";
  }
  // Reserve *before* the network call: unknown outcomes must never fan out
  // as one email every minute. External monitoring is still needed for outages.
  try {
    write(stamp, String(now) + "\n", { mode: 0o600 });
  } catch {
    throw new Error("STATE_WRITE_FAILED");
  }
  let response;
  try {
    response = await fetcher(API_URL, {
      method: "POST",
      redirect: "error",
      cache: "no-store",
      headers: { "api-key": cfg.key, accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        sender: cfg.sender,
        to: [{ email: cfg.recipient }],
        subject: "SayTwist watchdog failed: action required",
        textContent: [
          "The independent SayTwist Growth activation-lease watchdog failed.",
          "Growth workers must remain disabled until the failure is investigated.",
          "Review systemctl status saytwist-growth-lease-watchdog.service",
          "and journalctl -u saytwist-growth-lease-watchdog.service.",
          "Do not manually enable Growth or replay jobs.",
          "This notification is rate limited to at most one attempt per hour.",
        ].join("\n"),
      }),
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    throw new Error("SUBMISSION_UNKNOWN");
  }
  if (!response?.ok) throw new Error("SUBMISSION_NOT_CONFIRMED");
  return "SUBMITTED";
}

if (require.main === module) {
  sendWatchdogFailureAlert().then(result => {
    process.stdout.write("WATCHDOG_FAILURE_ALERT=" + result + "\n");
  }).catch(() => {
    // Never log network exception text, secrets, recipient, or response bodies.
    process.stderr.write("WATCHDOG_FAILURE_ALERT=ERROR\n");
    process.exitCode = 1;
  });
}

module.exports = { sendWatchdogFailureAlert, senderAddress, configuration };
