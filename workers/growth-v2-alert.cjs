/* eslint-disable @typescript-eslint/no-require-imports */
"use strict";
// Independent of Discord, PostgreSQL, Next.js and PM2. Only fixed incident
// metadata reaches the existing owner's Brevo channel; never child logs.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { senderAddress } = require("./growth-lease-watchdog-alert.cjs");
const APP = "/home/saytwist/htdocs/saytwist.com";
const COOLDOWN_MS = 24 * 60 * 60 * 1000;
const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s<>@]+$/;

async function sendGrowthV2FailureAlert({ env = process.env,
  username = os.userInfo().username, uid = process.getuid?.(), cwd = process.cwd(),
  now = Date.now(), read = fs.readFileSync, write = fs.writeFileSync, fetcher = fetch,
} = {}) {
  if (env.GROWTH_V2_ALERT_ENABLED !== "true") return "DISABLED";
  const component = env.GROWTH_V2_ALERT_COMPONENT;
  const sha = env.EXPECTED_RELEASE || "";
  if (!["courier", "intelligence"].includes(component) || username !== "saytwist" ||
      uid === 0 || cwd !== APP || env.NODE_ENV !== "production" ||
      env.STATE_DIRECTORY !== "/var/lib/saytwist-growth-v2-" + component + "-alert" ||
      !/^[a-f0-9]{40}$/.test(sha) || !Number.isSafeInteger(now) || now < 0) throw Error("V2_ALERT_RUNTIME_INVALID");
  const key = env.BREVO_API_KEY || "", recipient = env.ALERT_ADMIN_EMAIL || "";
  if (key.length < 8 || key.length > 2048 || !EMAIL.test(recipient)) throw Error("V2_ALERT_CONFIG_INVALID");
  const sender = senderAddress(env.EMAIL_FROM || "");
  const stamp = path.join(env.STATE_DIRECTORY, "last-alert-at");
  let previous;
  try { const value = read(stamp, "utf8").trim();
    if (!/^\d{13}$/.test(value)) throw Error("INVALID_STAMP"); previous = Number(value);
  } catch (error) { if (error?.code !== "ENOENT") throw Error("V2_ALERT_STATE_INVALID"); }
  if (previous !== undefined && now - previous < COOLDOWN_MS) return "SUPPRESSED";
  // Commit suppression before dispatch. Ambiguous email outcomes never fan out.
  write(stamp, String(now) + "\n", { mode: 0o600 });
  let response;
  try { response = await fetcher("https://api.brevo.com/v3/smtp/email", {
    method: "POST", redirect: "error", cache: "no-store",
    headers: { "api-key": key, Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ sender, to: [{ email: recipient }],
      subject: "SayTwist Growth V2 " + component + " requires attention",
      textContent: ["The Growth V2 " + component + " service failed or has an unresolved delivery incident.",
        "Review saytwist-growth-v2-" + component + ".service and the Admin Approval Center.",
        "Expected release: " + sha,
        "Existing decisions remain authoritative in PostgreSQL. Never auto-approve or blindly replay a Pin or uncertain message.",
        "This independent channel makes at most one submission attempt per component per 24 hours."].join("\n") }),
    signal: AbortSignal.timeout(12000),
  }); } catch { throw Error("V2_ALERT_SUBMISSION_UNKNOWN"); }
  if (!response?.ok) throw Error("V2_ALERT_SUBMISSION_NOT_CONFIRMED");
  return "SUBMITTED";
}
if (require.main === module) {
  sendGrowthV2FailureAlert().then(status => process.stdout.write("GROWTH_V2_ALERT=" + status + "\n"))
    .catch(() => { process.stderr.write("GROWTH_V2_ALERT=ERROR\n"); process.exitCode = 1; });
}
module.exports = { sendGrowthV2FailureAlert };
