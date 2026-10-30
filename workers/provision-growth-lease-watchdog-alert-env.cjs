/* eslint-disable @typescript-eslint/no-require-imports -- Root-owned install helper, plain Node. */
"use strict";
const fs = require("node:fs");
const { spawnSync } = require("node:child_process");

const APP = "/home/saytwist/htdocs/saytwist.com";
const NODE = "/home/saytwist/.nvm/versions/node/v24.20.0/bin/node";
const DEST = "/etc/saytwist-growth-watchdog-alert.env";
const KEYS = ["BREVO_API_KEY", "EMAIL_FROM", "ALERT_ADMIN_EMAIL"];

function fail() { throw new Error("WATCHDOG_ALERT_PROVISION=BLOCKED"); }

function validateValues(data) {
  if (!data || typeof data !== "object" || Array.isArray(data) ||
      Object.keys(data).length !== KEYS.length) fail();
  const values = {};
  for (const key of KEYS) {
    const value = data[key];
    if (typeof value !== "string" || value.length < 3 || value.length > 2048 ||
        /[\r\n\0]/.test(value) || /[^\x20-\x7e]/.test(value)) fail();
    values[key] = value;
  }
  return values;
}

function main() {
  if (process.getuid?.() !== 0) fail();
  const script = fs.realpathSync(process.argv[1] || "");
  const meta = fs.statSync(script);
  if (meta.uid !== 0 || (meta.mode & 0o777) !== 0o700) fail();
  const sha = fs.readFileSync(APP + "/.deployed-release", "utf8").trim();
  if (!/^[a-f0-9]{40}$/.test(sha) ||
      process.env.HOSTINGER_WATCHDOG_EXPECTED_SHA !== sha ||
      process.env.HOSTINGER_WATCHDOG_ALERT_PROVISION_APPROVAL !==
        "PROVISION SAYTWIST WATCHDOG ALERT " + sha) fail();
  if (fs.existsSync(DEST)) fail();

  const child = String.raw`
    const { execFileSync } = require("node:child_process");
    const cli = "/home/saytwist/.npm/_npx/5f7878ce38f1eb13/node_modules/pm2/bin/pm2";
    const rows = JSON.parse(execFileSync(cli, ["jlist"], {
      encoding: "utf8", timeout: 10000, maxBuffer: 16*1024*1024,
      env: { ...process.env, PM2_HOME: "/home/saytwist/.pm2",
        PATH: "/home/saytwist/.nvm/versions/node/v24.20.0/bin:/usr/bin:/bin" },
    }));
    const matches = rows.filter(x => x.name === "saytwist" &&
      x.pm2_env?.status === "online" &&
      x.pm2_env?.pm_cwd === "/home/saytwist/htdocs/saytwist.com");
    if (matches.length !== 1) process.exit(1);
    const env = matches[0].pm2_env;
    const out = {};
    for (const key of ["BREVO_API_KEY", "EMAIL_FROM", "ALERT_ADMIN_EMAIL"]) {
      out[key] = env[key] ?? env.env?.[key];
    }
    process.stdout.write(JSON.stringify(out));
  `;
  const run = spawnSync("/usr/sbin/runuser", ["-u", "saytwist", "--", NODE, "-e", child], {
    encoding: "utf8", maxBuffer: 8192, timeout: 15000,
    env: { HOME: "/home/saytwist", PATH: "/usr/sbin:/usr/bin:/bin" },
  });
  if (run.error || run.status !== 0) fail();
  let values;
  try { values = validateValues(JSON.parse(run.stdout)); }
  catch { fail(); }
  const data = KEYS.map(key => key + "=" + JSON.stringify(values[key])).join("\n") + "\n";
  const temp = DEST + ".tmp-" + process.pid;
  try {
    const fd = fs.openSync(temp, "wx", 0o600);
    try {
      fs.writeFileSync(fd, data);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.chownSync(temp, 0, 0);
    fs.chmodSync(temp, 0o600);
    fs.renameSync(temp, DEST);
  } catch {
    try { fs.unlinkSync(temp); } catch {}
    fail();
  }
  process.stdout.write("WATCHDOG_ALERT_CONFIG=ROOT_OWNED_READY\n");
  process.stdout.write("WATCHDOG_ALERT_EMAIL_SENT=NO\n");
}

if (require.main === module) {
  try { main(); }
  catch { process.stderr.write("WATCHDOG_ALERT_PROVISION=BLOCKED\n"); process.exitCode = 1; }
}
module.exports = { validateValues };
