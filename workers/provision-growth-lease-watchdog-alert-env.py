#!/usr/bin/python3
"""Separately owner-approved, root-owned provisioner for the watchdog alert.

Run with a verified, root-owned /usr/bin/python3 -I interpreter and a reviewed
root-owned 0700 script copy outside the saytwist-writable application tree.
No network operations, email delivery, unit installation, or Growth changes.
"""
import json
import os
from pathlib import Path
import re
import secrets
import stat
import subprocess
import sys

APP = Path("/home/saytwist/htdocs/saytwist.com")
DEST = Path("/etc/saytwist-growth-watchdog-alert.env")
NODE = "/home/saytwist/.nvm/versions/node/v24.20.0/bin/node"
RUNUSER = "/usr/sbin/runuser"
KEYS = ("BREVO_API_KEY", "EMAIL_FROM", "ALERT_ADMIN_EMAIL")
SHA_PATTERN = re.compile(r"^[a-f0-9]{40}$")
EMAIL_PATTERN = re.compile(r"^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$")
DISPLAY_PATTERN = re.compile(r"^([^<>]{1,80})<\s*([^\s<>@]+@[^\s<>@]+\.[^\s<>@]+)\s*>$")

# This is executed only as the unprivileged saytwist account.
# In particular, never load or run the app's Node executable under root.
UNPRIVILEGED_PM2_READ = r"""
"use strict";
const {execFileSync} = require("node:child_process");
try {
  const cli = "/home/saytwist/.npm/_npx/5f7878ce38f1eb13/node_modules/pm2/bin/pm2";
  const rows = JSON.parse(execFileSync(cli, ["jlist"], {
    encoding: "utf8", timeout: 10000, maxBuffer: 16*1024*1024,
    env: {...process.env, PM2_HOME: "/home/saytwist/.pm2",
      PATH: "/home/saytwist/.nvm/versions/node/v24.20.0/bin:/usr/bin:/bin"},
  }));
  const {validatedDatabaseUrl} =
    require("/home/saytwist/htdocs/saytwist.com/workers/growth-lease-watchdog-launch.cjs");
  validatedDatabaseUrl(rows);
  const matches = rows.filter(x => x.name === "saytwist");
  if (matches.length !== 1) process.exit(1);
  const env = matches[0].pm2_env;
  const values = {};
  for (const k of ["BREVO_API_KEY", "EMAIL_FROM", "ALERT_ADMIN_EMAIL"])
    values[k] = env[k] ?? env.env?.[k];
  process.stdout.write(JSON.stringify(values));
} catch { process.exitCode=1; }
"""


def block():
    raise RuntimeError("WATCHDOG_ALERT_PROVISION_BLOCKED")


def validate_values(raw):
    if not isinstance(raw, dict) or set(raw) != set(KEYS):
        block()
    values = {}
    for key in KEYS:
        value = raw[key]
        if (not isinstance(value, str) or not 3 <= len(value) <= 2048
                or any(ord(c) < 32 or ord(c) > 126 for c in value)):
            block()
        values[key] = value
    if len(values["BREVO_API_KEY"]) < 8:
        block()
    if not EMAIL_PATTERN.fullmatch(values["ALERT_ADMIN_EMAIL"]):
        block()
    from_address = values["EMAIL_FROM"]
    sender_match = DISPLAY_PATTERN.fullmatch(from_address)
    if sender_match:
        if not sender_match[1].strip() or not EMAIL_PATTERN.fullmatch(sender_match[2]):
            block()
    elif not EMAIL_PATTERN.fullmatch(from_address):
        block()
    return values


def serialize_env(values):
    clean = validate_values(values)
    # systemd EnvironmentFile accepts quoted, backslash-escaped values.
    # ASCII-printable-only inputs exclude newlines, NULs and multiline injection.
    return "".join(key + "=" + json.dumps(clean[key], ensure_ascii=True) + "\n"
                   for key in KEYS).encode("ascii")


def check_root_owned_binary(file):
    src = Path(file)
    resolved = src.resolve(strict=True)
    st = resolved.stat()
    if st.st_uid != 0 or not stat.S_ISREG(st.st_mode) or (st.st_mode & 0o022):
        block()
    for parent in resolved.parents:
        pst = parent.stat()
        if pst.st_uid != 0 or pst.st_mode & 0o022:
            block()


def preflight_root():
    if os.geteuid() != 0 or not sys.flags.isolated:
        block()
    if not os.path.isabs(sys.argv[0]):
        block()
    source = Path(sys.argv[0])
    if source.is_symlink() or source.resolve(strict=True) != source:
        block()
    stat_info = source.stat()
    if (stat_info.st_uid != 0 or not stat.S_ISREG(stat_info.st_mode)
            or stat.S_IMODE(stat_info.st_mode) != 0o700):
        block()
    check_root_owned_binary(source)
    check_root_owned_binary(sys.executable)
    check_root_owned_binary(RUNUSER)

    release = (APP / ".deployed-release").read_text(encoding="ascii").strip()
    if (not SHA_PATTERN.fullmatch(release)
            or os.environ.get("HOSTINGER_WATCHDOG_EXPECTED_SHA") != release
            or os.environ.get("HOSTINGER_WATCHDOG_ALERT_PROVISION_APPROVAL") !=
                "PROVISION SAYTWIST WATCHDOG ALERT " + release):
        block()
    if DEST.is_symlink() or DEST.exists():
        block()
    # The target directory must not be writable by the application user.
    check_root_owned_binary("/usr/bin/python3")
    parent = DEST.parent.stat()
    if parent.st_uid != 0 or parent.st_mode & 0o022:
        block()


def read_unprivileged_pm2():
    run = subprocess.run(
        [RUNUSER, "-u", "saytwist", "--", NODE, "-e", UNPRIVILEGED_PM2_READ],
        capture_output=True, timeout=16, check=False, cwd=APP,
        env={"HOME": "/home/saytwist", "PATH": "/usr/sbin:/usr/bin:/bin"},
    )
    if run.returncode != 0 or not 0 < len(run.stdout) <= 8192:
        block()
    try:
        parsed = json.loads(run.stdout)
    except (ValueError, UnicodeError):
        block()
    return validate_values(parsed)


def write_private_file(data):
    # The directory is root-owned. Hard link, not replace, fails if destination
    # was unexpectedly created and prevents clobbering another configuration.
    temporary = DEST.with_name(DEST.name + ".tmp-" + secrets.token_hex(16))
    fd = None
    try:
        fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        os.fchown(fd, 0, 0)
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "wb") as stream:
            fd = None
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.link(temporary, DEST, follow_symlinks=False)
        dfd = os.open(DEST.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(dfd)
        finally:
            os.close(dfd)
    finally:
        if fd is not None:
            os.close(fd)
        try:
            temporary.unlink(missing_ok=True)
        except OSError:
            pass


def main():
    preflight_root()
    values = read_unprivileged_pm2()
    write_private_file(serialize_env(values))
    print("WATCHDOG_ALERT_CONFIG=ROOT_OWNED_READY")
    print("WATCHDOG_ALERT_EMAIL_SENT=NO")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        # Never print exception messages, PM2 JSON, recipient, API key, or paths.
        print("WATCHDOG_ALERT_PROVISION=BLOCKED", file=sys.stderr)
        sys.exit(1)
