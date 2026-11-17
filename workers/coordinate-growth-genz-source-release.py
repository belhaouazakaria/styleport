#!/usr/bin/env python3
"""Exact-SHA Gen-Z source-design release: migration 41 unchanged, 14 timer hold/restore.

Copy outside the live app as root:root 0700. Never migrates, deploys, approves,
claims, cancels or resets jobs. A partial rotation requires restoration of the
private configuration archive before retry; all timers remain disabled on error.
"""
import hashlib
import json
import os
import pathlib
import re
import stat
import subprocess
import sys
import tarfile
import urllib.request
from datetime import datetime, timezone

OLD = "145215b742916b81ff1b1fc86bd3882fb516385a"
APP = pathlib.Path("/home/saytwist/htdocs/saytwist.com")
NODE = "/home/saytwist/.nvm/versions/node/v24.20.0/bin/node"
PM2 = "/home/saytwist/.npm/_npx/5f7878ce38f1eb13/node_modules/pm2/bin/pm2"
BASE = pathlib.Path("/etc/systemd/system")
STATE = pathlib.Path("/etc/saytwist-growth-genz-source-release-state.json")
NAMES = "lease-watchdog daily-observe autonomous-cycle approved-publisher daily-fresh private-report autonomous-content daily-account-analytics auto-translator-publish viral-discovery viral-source pin-maintenance v2-courier v2-intelligence".split()
TIMERS = ["saytwist-growth-" + n + ".timer" for n in NAMES]
PRIVATE = [pathlib.Path(p) for p in ["/etc/saytwist-growth-viral-source-approval.env", "/etc/saytwist/growth-v2-courier.env", "/etc/saytwist/growth-v2-intelligence.env", "/etc/saytwist-growth-private-report.env"]]
FILES = [BASE / ("saytwist-growth-" + n + suffix) for n in NAMES for suffix in [".service", ".timer"]] + [BASE / "saytwist-growth-v2-alert@.service"] + PRIVATE
mutating = False


def run(args, **kwargs):
    return subprocess.check_output(args, text=True, stderr=subprocess.PIPE, **kwargs).strip()


def trusted(p, mode):
    assert p.is_file() and not p.is_symlink()
    s = p.stat()
    assert s.st_uid == s.st_gid == 0 and stat.S_IMODE(s.st_mode) == mode


def write_state(value):
    tmp = STATE.with_suffix(".tmp")
    with tmp.open("w") as f:
        os.chmod(tmp, 0o600)
        json.dump(value, f)
    os.replace(tmp, STATE)


def properties(unit, name):
    return run(["systemctl", "show", "-P", name, unit])


def configs(sha, enabled):
    for p in FILES:
        trusted(p, 0o600 if p in PRIVATE else 0o644)
    for n in NAMES:
        svc = "saytwist-growth-" + n + ".service"
        timer = "saytwist-growth-" + n + ".timer"
        key = "WATCHDOG_EXPECTED_RELEASE_SHA" if n == "lease-watchdog" else "EXPECTED_RELEASE"
        assert "Environment=" + key + "=" + sha in (BASE / svc).read_text()
        assert key + "=" + sha in properties(svc, "Environment").split()
        assert properties(svc, "User") == "saytwist"
        assert not properties(svc, "DropInPaths") and not properties(timer, "DropInPaths")
        assert properties(svc, "ActiveState") not in ["active", "activating", "deactivating"]
        result = subprocess.run(["systemctl", "is-enabled", timer], capture_output=True, text=True)
        assert result.stdout.strip() == ("enabled" if enabled else "disabled")
        assert (properties(timer, "ActiveState") == "active") == enabled
    assert "EXPECTED_RELEASE=" + sha in (BASE / "saytwist-growth-v2-alert@.service").read_text()
    assert "SAYTWIST_VIRAL_SOURCE:" + sha in PRIVATE[0].read_text()
    for mode, p in zip(["courier", "intelligence"], PRIVATE[1:3]):
        assert "SAYTWIST_V2:" + mode + ":" + sha in p.read_text()


def digest_configs():
    return {str(p): hashlib.sha256(p.read_bytes()).hexdigest() for p in FILES}


def ready():
    with urllib.request.urlopen("http://127.0.0.1:3001/api/readyz", timeout=10) as r:
        assert r.status == 200


def main():
    global mutating
    assert os.getuid() == 0 and len(sys.argv) == 4
    trusted(pathlib.Path(__file__), 0o700)
    mode, new, source_arg = sys.argv[1:]
    assert mode in ["audit", "hold", "restore", "recover"] and len(new) == 40 and all(c in "0123456789abcdef" for c in new) and new != OLD
    assert datetime.now(timezone.utc).hour in [0, 1, 2, 3] + list(range(15, 24))
    source = pathlib.Path(source_arg)
    assert source.is_absolute() and source.resolve() == source and source.is_relative_to(pathlib.Path("/root")) and not source.is_relative_to(APP) and not source.is_symlink()
    assert source.stat().st_uid == 0 and stat.S_IMODE(source.stat().st_mode) == 0o700
    assert (source / ".release-sha").read_text().strip() == new
    qualifier = source.parent / "genz-source-qualification.json"
    trusted(qualifier, 0o600)
    q = json.loads(qualifier.read_text())
    assert q["releaseSha"] == new and re.fullmatch(r"[a-z0-9_]{4,63}", q["cloneDatabase"]) and q["cloneDatabase"] != "saytwist" and q["cloneMigrations"] == 41 and q["cloneVerified"] is True
    for file_key, digest_key in [("backupPath", "backupSha256"), ("artifactZipPath", "artifactZipSha256")]:
        p = pathlib.Path(q[file_key]); trusted(p, 0o600)
        assert hashlib.file_digest(p.open("rb"), "sha256").hexdigest() == q[digest_key]
    history = json.loads(run(["runuser", "-u", "postgres", "--", "/usr/lib/postgresql/18/bin/psql", "-p", "5433", "-d", "saytwist", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-c", 'SELECT json_agg(json_build_object(\'name\',migration_name,\'checksum\',checksum)) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;']))
    # This is code-only: production and the qualified clone must both remain
    # at the existing 41-migration schema throughout the release.
    assert len(history) == 41
    for row in history:
        assert re.fullmatch(r"\d{14}_[a-z0-9_]+", row["name"])
        assert hashlib.sha256((source / "prisma/migrations" / row["name"] / "migration.sql").read_bytes()).hexdigest() == row["checksum"]
    listing = run(["/usr/sbin/runuser", "-u", "saytwist", "--", "env", "HOME=/home/saytwist", "PM2_HOME=/home/saytwist/.pm2", "PATH=/home/saytwist/.nvm/versions/node/v24.20.0/bin:/usr/bin:/bin", NODE, PM2, "jlist"])
    db = run([NODE, "-e", "const fs=require('fs');const a=fs.readFileSync(0,'utf8');process.stdout.write(require(process.argv[1]).validatedDatabaseUrl(a));", str(APP / "workers/growth-lease-watchdog-launch.cjs")], input=listing)
    env = {"PATH": "/home/saytwist/.nvm/versions/node/v24.20.0/bin:/usr/bin:/bin", "HOME": "/root", "NODE_ENV": "production", "DATABASE_URL": db, "GROWTH_V2_FOLLOWUP_EVIDENCE": "true"}

    def evidence():
        r = json.loads(run([NODE, str(APP / "node_modules/tsx/dist/cli.mjs"), "--tsconfig", str(APP / "tsconfig.json"), str(source / "scripts/growth-v2-followup-evidence.ts")], env=env, cwd=APP))
        assert r["safe"] is True and len(r["fingerprint"]) == 64
        return r["fingerprint"]

    fingerprint = evidence()
    if mode in ["audit", "hold"]:
        assert (APP / ".deployed-release").read_text().strip() == OLD
        configs(OLD, True); ready()
        if mode == "audit":
            print("GENZ_SOURCE_AUDIT=PASSED_41_MIGRATIONS_14_TIMERS_SAFE_QUEUE"); return
        assert os.environ.get("GROWTH_GENZ_SOURCE_RELEASE_APPROVAL") == "HOLD:" + OLD + ":" + new and not STATE.exists()
        archive = source.parent / ("genz-source-config-backup-" + new[:12] + ".tar.gz")
        assert not archive.exists()
        with tarfile.open(archive, "w:gz") as tar:
            os.chmod(archive, 0o600)
            for p in FILES: tar.add(p, arcname=str(p).lstrip("/"))
        state = {"old": OLD, "new": new, "migrations": 41, "fingerprint": fingerprint, "configDigests": digest_configs(), "archive": str(archive), "status": "HOLDING"}
        write_state(state); mutating = True
        subprocess.run(["systemctl", "disable", "--now"] + TIMERS, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        configs(OLD, False); assert evidence() == fingerprint
        state["status"] = "HELD"; write_state(state)
        print("GENZ_SOURCE_HOLD=PASSED"); return
    assert os.environ.get("GROWTH_GENZ_SOURCE_RELEASE_APPROVAL") == ("RECOVER:" if mode == "recover" else "RESTORE:") + OLD + ":" + new
    trusted(STATE, 0o600); state = json.loads(STATE.read_text())
    assert state["old"] == OLD and state["new"] == new and state["migrations"] == 41 and state["status"] == "HELD" and state["fingerprint"] == fingerprint
    target = OLD if mode == "recover" else new
    assert (APP / ".deployed-release").read_text().strip() == target
    configs(OLD, False); assert digest_configs() == state["configDigests"]; ready(); mutating = True
    # Rotate only release SHA pins and the already SHA-bound private approvals.
    for p in FILES:
        if mode == "recover":
            break
        s = p.read_text().replace(OLD, new)
        tmp = p.with_suffix(p.suffix + ".genz-source-tmp")
        tmp.write_text(s); os.chmod(tmp, 0o600 if p in PRIVATE else 0o644); os.replace(tmp, p)
    subprocess.run(["systemctl", "daemon-reload"], check=True)
    configs(target, False); assert evidence() == fingerprint
    subprocess.run(["systemctl", "start", "saytwist-growth-lease-watchdog.service"], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    assert properties("saytwist-growth-lease-watchdog.service", "Result") == "success"
    subprocess.run(["systemctl", "enable", "--now"] + TIMERS, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    for timer in TIMERS:
        assert run(["systemctl", "is-enabled", timer]) == "enabled" and properties(timer, "ActiveState") == "active"
    state["status"] = "RECOVERED" if mode == "recover" else "RESTORED"; write_state(state)
    print("GENZ_SOURCE_" + ("RECOVER" if mode == "recover" else "RESTORE") + "=PASSED_14_TIMERS_ENABLED")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        if mutating:
            subprocess.run(["systemctl", "disable", "--now"] + TIMERS, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        print("GENZ_SOURCE_RELEASE=BLOCKED", file=sys.stderr)
        sys.exit(1)
