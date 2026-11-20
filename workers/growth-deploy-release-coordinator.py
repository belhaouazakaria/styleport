#!/usr/bin/env python3
"""Hold and restore the existing Growth timers around an approved app deploy.

This root-only helper changes only release-SHA pins and matching SHA-bound
owner approvals. It never runs a Growth worker or mutates the job queue.
"""
import hashlib
import json
import os
import pathlib
import re
import shutil
import stat
import subprocess
import sys
import tempfile

APP = pathlib.Path("/home/saytwist/htdocs/saytwist.com")
UNIT_DIR = pathlib.Path("/etc/systemd/system")
APPROVALS = [
    pathlib.Path("/etc/saytwist-growth-viral-source-approval.env"),
    pathlib.Path("/etc/saytwist/growth-v2-courier.env"),
    pathlib.Path("/etc/saytwist/growth-v2-intelligence.env"),
    pathlib.Path("/etc/saytwist-growth-private-report.env"),
]
NAMES = "lease-watchdog daily-observe autonomous-cycle approved-publisher daily-fresh private-report autonomous-content daily-account-analytics auto-translator-publish viral-discovery viral-source pin-maintenance v2-courier v2-intelligence".split()
TIMERS = ["saytwist-growth-" + name + ".timer" for name in NAMES]
UNITS = [UNIT_DIR / ("saytwist-growth-" + name + ext)
         for name in NAMES for ext in (".service", ".timer")]
UNITS.append(UNIT_DIR / "saytwist-growth-v2-alert@.service")
FILES = UNITS + APPROVALS
STATE = pathlib.Path("/etc/saytwist-growth-deploy-coordinator.json")
HISTORY = pathlib.Path("/var/lib/saytwist-growth-deploy-coordinator")
PSQL = "/usr/lib/postgresql/18/bin/psql"
ACTIVE_JOBS_SQL = "SELECT count(*) FROM \"GrowthJob\" WHERE status IN ('CLAIMED','RUNNING','FAILED_RETRYABLE');"
PENDING_SQL = "SELECT COALESCE(json_agg(json_build_array(id,type,status,\"runAfter\",\"attemptCount\",\"maxAttempts\",\"idempotencyKey\",payload) ORDER BY id),'[]'::json)::text FROM \"GrowthJob\" WHERE status='PENDING';"


def run(args, *, check=True, capture=True):
    return subprocess.run(args, check=check, text=True,
                          stdout=subprocess.PIPE if capture else subprocess.DEVNULL,
                          stderr=subprocess.PIPE if capture else subprocess.DEVNULL).stdout.strip() if capture else ""


def psql(query):
    return run(["runuser", "-u", "postgres", "--", PSQL, "-p", "5433",
                "-d", "saytwist", "-X", "-Atq", "-v", "ON_ERROR_STOP=1",
                "-c", query])


def assert_safe_database(expected_pending=None):
    safe = psql('SELECT CASE WHEN count(*)=1 AND bool_and(NOT "enabled" AND NOT "attributionEnabled" AND "workerActivationExpiresAt" IS NULL) THEN 1 ELSE 0 END FROM "GrowthSettings" WHERE id=\'global\';')
    if safe != "1" or psql(ACTIVE_JOBS_SQL) != "0":
        raise RuntimeError("GROWTH_NOT_IDLE")
    pending = psql(PENDING_SQL)
    digest = hashlib.sha256(pending.encode()).hexdigest()
    if expected_pending is not None and digest != expected_pending:
        raise RuntimeError("PENDING_QUEUE_CHANGED")
    return digest


def systemctl(*args, check=True, capture=True):
    return run(["systemctl", *args], check=check, capture=capture)


def file_digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def check_root_file(path, mode):
    if path.is_symlink() or not path.is_file():
        raise RuntimeError("UNIT_FILE_UNSAFE")
    info = path.stat()
    if info.st_uid != 0 or info.st_gid != 0 or stat.S_IMODE(info.st_mode) != mode:
        raise RuntimeError("UNIT_FILE_UNSAFE")


def service_release(name, text):
    key = "WATCHDOG_EXPECTED_RELEASE_SHA" if name == "lease-watchdog" else "EXPECTED_RELEASE"
    values = re.findall(r"^Environment=" + key + r"=([a-f0-9]{40})$", text, re.M)
    if len(values) != 1:
        raise RuntimeError("SERVICE_RELEASE_PIN_INVALID")
    return values[0]


def check_config(pins, held):
    for path in UNITS:
        check_root_file(path, 0o644)
    for path in APPROVALS:
        check_root_file(path, 0o600)
    for name in NAMES:
        service = UNIT_DIR / ("saytwist-growth-" + name + ".service")
        timer = UNIT_DIR / ("saytwist-growth-" + name + ".timer")
        if service_release(name, service.read_text()) != pins[name]:
            raise RuntimeError("SERVICE_RELEASE_PIN_MISMATCH")
        if systemctl("show", "-P", "User", service.name) != "saytwist":
            raise RuntimeError("SERVICE_USER_INVALID")
        if systemctl("show", "-P", "DropInPaths", service.name) or systemctl("show", "-P", "DropInPaths", timer.name):
            raise RuntimeError("SYSTEMD_DROPIN_UNEXPECTED")
        active = systemctl("is-active", service.name, check=False)
        if active in ("active", "activating", "deactivating"):
            raise RuntimeError("GROWTH_SERVICE_ACTIVE")
        enabled = systemctl("is-enabled", timer.name, check=False)
        if enabled not in ("enabled", "disabled"):
            raise RuntimeError("GROWTH_TIMER_ENABLE_STATE_INVALID")
        if held and enabled != "disabled":
            raise RuntimeError("GROWTH_TIMER_NOT_HELD")
        if held and systemctl("is-active", timer.name, check=False) == "active":
            raise RuntimeError("GROWTH_TIMER_STILL_ACTIVE")
    alert = (UNIT_DIR / "saytwist-growth-v2-alert@.service").read_text()
    if pins["v2-courier"] != pins["v2-intelligence"]:
        raise RuntimeError("V2_RELEASE_PINS_DIVERGED")
    if not re.search(r"^Environment=EXPECTED_RELEASE=" + re.escape(pins["v2-courier"]) + r"$", alert, re.M):
        raise RuntimeError("V2_ALERT_RELEASE_PIN_MISMATCH")
    expectations = [
        (APPROVALS[0], "GROWTH_VIRAL_SOURCE_OWNER_APPROVAL", "SAYTWIST_VIRAL_SOURCE:", pins["viral-source"], False),
        (APPROVALS[1], "GROWTH_V2_SERVICE_APPROVAL", "SAYTWIST_V2:courier:", pins["v2-courier"], True),
        (APPROVALS[2], "GROWTH_V2_SERVICE_APPROVAL", "SAYTWIST_V2:intelligence:", pins["v2-intelligence"], True),
    ]
    for path, key, prefix, sha, quoted in expectations:
        quote = r'"?' if quoted else ""
        if len(re.findall(r"^" + key + "=" + quote + re.escape(prefix + sha) + quote + r"$", path.read_text(), re.M)) != 1:
            raise RuntimeError("PRIVATE_APPROVAL_PIN_MISMATCH")
    inline = [
        ("private-report", "GROWTH_PRIVATE_REPORT_APPROVAL", "SAYTWIST_PRIVATE_DAILY_REPORT:"),
        ("viral-discovery", "GROWTH_VIRAL_DISCOVERY_OWNER_APPROVAL", "SAYTWIST_VIRAL_DISCOVERY:"),
        ("pin-maintenance", "GROWTH_PIN_MAINTENANCE_OWNER_APPROVAL", "SAYTWIST_PIN_MAINTENANCE:"),
    ]
    for name, key, prefix in inline:
        text = (UNIT_DIR / ("saytwist-growth-" + name + ".service")).read_text()
        expected = r"^Environment=" + key + "=" + re.escape(prefix + pins[name]) + r"$"
        if len(re.findall(expected, text, re.M)) != 1:
            raise RuntimeError("INLINE_APPROVAL_PIN_MISMATCH")


def write_state(state):
    tmp = STATE.with_suffix(".tmp")
    tmp.write_text(json.dumps(state, sort_keys=True) + "\n")
    os.chown(tmp, 0, 0)
    os.chmod(tmp, 0o600)
    os.replace(tmp, STATE)


def archive_state(state, suffix):
    HISTORY.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chown(HISTORY, 0, 0)
    os.chmod(HISTORY, 0o700)
    target = HISTORY / (state["new"] + "-" + suffix + ".json")
    if target.exists():
        raise RuntimeError("RECOVERY_HISTORY_EXISTS")
    write_state(state)
    os.replace(STATE, target)


def hold(new_sha):
    if not re.fullmatch(r"[a-f0-9]{40}", new_sha):
        raise RuntimeError("NEW_SHA_INVALID")
    if STATE.exists():
        check_root_file(STATE, 0o600)
        prior = json.loads(STATE.read_text())
        if (prior.get("status") == "HELD" and prior.get("new") == new_sha
                and (APP / ".deployed-release").read_text().strip() == prior.get("old")):
            assert_safe_database(prior["pendingSha256"])
            check_config(prior["oldPins"], held=True)
            print("GROWTH_DEPLOY_TIMERS=ALREADY_HELD_14")
            return
        raise RuntimeError("RECOVERY_STATE_EXISTS")
    old_sha = (APP / ".deployed-release").read_text().strip()
    if not re.fullmatch(r"[a-f0-9]{40}", old_sha) or old_sha == new_sha:
        raise RuntimeError("DEPLOYED_SHA_INVALID")
    pending_sha = assert_safe_database()
    pins = {name: service_release(name, (UNIT_DIR / ("saytwist-growth-" + name + ".service")).read_text())
            for name in NAMES}
    if any(pins[name] != old_sha for name in NAMES if name not in ("v2-courier", "v2-intelligence")):
        raise RuntimeError("ACTIVE_TIMER_RELEASE_PIN_MISMATCH")
    check_config(pins, held=False)
    for timer in TIMERS:
        if systemctl("is-active", timer, check=False) not in ("active", "inactive", "failed"):
            raise RuntimeError("GROWTH_TIMER_STATE_INVALID")
    for url in ("http://127.0.0.1:3001/api/healthz", "http://127.0.0.1:3001/api/readyz"):
        run(["curl", "--fail", "--silent", "--show-error", "--max-time", "5", url])

    backup = pathlib.Path(tempfile.mkdtemp(prefix="saytwist-growth-release-", dir="/root"))
    os.chown(backup, 0, 0)
    os.chmod(backup, 0o700)
    for path in FILES:
        dest = backup / ("private" if path in APPROVALS else "systemd") / path.name
        dest.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        shutil.copy2(path, dest)
    timers = {}
    for timer in TIMERS:
        timers[timer] = {
            "enabled": systemctl("is-enabled", timer, check=False) == "enabled",
            "active": systemctl("is-active", timer, check=False) == "active",
        }
    state = {"old": old_sha, "new": new_sha, "oldPins": pins, "status": "HOLDING",
             "backup": str(backup), "files": {str(path): file_digest(path) for path in FILES},
             "timers": timers, "pendingSha256": pending_sha}
    write_state(state)
    try:
        systemctl("disable", "--now", *TIMERS, capture=False)
        check_config(pins, held=True)
        assert_safe_database(pending_sha)
        state["status"] = "HELD"
        write_state(state)
    except Exception:
        systemctl("disable", "--now", *TIMERS, check=False, capture=False)
        state["status"] = "FAILED_HELD"
        write_state(state)
        raise
    print("GROWTH_DEPLOY_TIMERS=HELD_14")


def replace_fields(path, fields, new):
    original = path.read_text()
    lines = original.splitlines(keepends=True)
    changed = set()
    result = []
    for line in lines:
        updated = line
        for key, old in fields.items():
            if updated.startswith("Environment=" + key + "=") or updated.startswith(key + "="):
                value = updated.rstrip("\r\n")
                if value.endswith(old) or value.endswith(old + '"') or value.endswith(old + "'"):
                    updated = updated.replace(old, new)
                    changed.add(key)
        result.append(updated)
    if changed != set(fields):
        raise RuntimeError("SHA_ROTATION_INVALID")
    replaced = "".join(result)
    tmp = path.with_name("." + path.name + ".growth-repin")
    tmp.write_text(replaced)
    os.chown(tmp, 0, 0)
    os.chmod(tmp, 0o600 if path in APPROVALS else 0o644)
    os.replace(tmp, path)


def restore(release_sha):
    check_root_file(STATE, 0o600)
    state = json.loads(STATE.read_text())
    if state.get("status") != "HELD" or release_sha != state.get("new"):
        raise RuntimeError("RECOVERY_STATE_INVALID")
    if (APP / ".deployed-release").read_text().strip() != release_sha:
        raise RuntimeError("DEPLOYED_RELEASE_MISMATCH")
    assert_safe_database(state["pendingSha256"])
    run(["curl", "--fail", "--silent", "--show-error", "--max-time", "5",
         "http://127.0.0.1:3001/api/healthz"])
    run(["curl", "--fail", "--silent", "--show-error", "--max-time", "5",
         "http://127.0.0.1:3001/api/readyz"])
    check_config(state["oldPins"], held=True)
    if {str(path): file_digest(path) for path in FILES} != state["files"]:
        raise RuntimeError("RELEASE_CONFIG_CHANGED_DURING_HOLD")
    state["status"] = "RESTORING"
    write_state(state)
    try:
        inline_approvals = {
            "private-report": "GROWTH_PRIVATE_REPORT_APPROVAL",
            "viral-discovery": "GROWTH_VIRAL_DISCOVERY_OWNER_APPROVAL",
            "pin-maintenance": "GROWTH_PIN_MAINTENANCE_OWNER_APPROVAL",
        }
        for name in NAMES:
            service = UNIT_DIR / ("saytwist-growth-" + name + ".service")
            expected_key = "WATCHDOG_EXPECTED_RELEASE_SHA" if name == "lease-watchdog" else "EXPECTED_RELEASE"
            fields = {expected_key: state["oldPins"][name]}
            if name in inline_approvals:
                fields[inline_approvals[name]] = state["oldPins"][name]
            replace_fields(service, fields, release_sha)
        replace_fields(UNITS[-1], {"EXPECTED_RELEASE": state["oldPins"]["v2-courier"]}, release_sha)
        for path, key, old in [
            (APPROVALS[0], "GROWTH_VIRAL_SOURCE_OWNER_APPROVAL", state["oldPins"]["viral-source"]),
            (APPROVALS[1], "GROWTH_V2_SERVICE_APPROVAL", state["oldPins"]["v2-courier"]),
            (APPROVALS[2], "GROWTH_V2_SERVICE_APPROVAL", state["oldPins"]["v2-intelligence"]),
        ]:
            replace_fields(path, {key: old}, release_sha)
        systemctl("daemon-reload")
        check_config({name: release_sha for name in NAMES}, held=True)
        watchdog = "saytwist-growth-lease-watchdog.timer"
        if state["timers"][watchdog]["enabled"]:
            systemctl("start", "saytwist-growth-lease-watchdog.service")
            if systemctl("show", "-P", "Result", "saytwist-growth-lease-watchdog.service") != "success":
                raise RuntimeError("WATCHDOG_START_FAILED")
        for timer in TIMERS:
            original = state["timers"][timer]
            if original["enabled"]:
                systemctl("enable", timer)
            if original["active"]:
                systemctl("start", timer)
        for timer in TIMERS:
            current = state["timers"][timer]
            enabled = systemctl("is-enabled", timer, check=False) == "enabled"
            active = systemctl("is-active", timer, check=False) == "active"
            if enabled != current["enabled"] or active != current["active"]:
                raise RuntimeError("GROWTH_TIMER_RESTORE_FAILED")
        check_config({name: release_sha for name in NAMES}, held=False)
        assert_safe_database(state["pendingSha256"])
        state["status"] = "RESTORED"
        archive_state(state, "restored")
    except Exception:
        systemctl("disable", "--now", *TIMERS, check=False, capture=False)
        state["status"] = "FAILED_HELD"
        write_state(state)
        raise
    print("GROWTH_DEPLOY_TIMERS=RESTORED_14")


def recover(release_sha):
    check_root_file(STATE, 0o600)
    state = json.loads(STATE.read_text())
    if state.get("status") not in ("HELD", "FAILED_HELD", "RESTORING") or release_sha != state.get("old"):
        raise RuntimeError("RECOVERY_STATE_INVALID")
    if (APP / ".deployed-release").read_text().strip() != release_sha:
        raise RuntimeError("DEPLOYED_RELEASE_MISMATCH")
    assert_safe_database(state["pendingSha256"])
    run(["curl", "--fail", "--silent", "--show-error", "--max-time", "5",
         "http://127.0.0.1:3001/api/healthz"])
    run(["curl", "--fail", "--silent", "--show-error", "--max-time", "5",
         "http://127.0.0.1:3001/api/readyz"])
    backup = pathlib.Path(state["backup"])
    if backup.parent != pathlib.Path("/root") or not backup.is_dir() or backup.is_symlink():
        raise RuntimeError("BACKUP_UNSAFE")
    backup_stat = backup.stat()
    if backup_stat.st_uid != 0 or backup_stat.st_gid != 0 or stat.S_IMODE(backup_stat.st_mode) != 0o700:
        raise RuntimeError("BACKUP_UNSAFE")
    state["status"] = "RECOVERING"
    write_state(state)
    try:
        for path in FILES:
            copy = backup / ("private" if path in APPROVALS else "systemd") / path.name
            info = copy.stat()
            if not copy.is_file() or copy.is_symlink() or info.st_uid != 0 or info.st_gid != 0:
                raise RuntimeError("BACKUP_FILE_UNSAFE")
            if file_digest(copy) != state["files"][str(path)]:
                raise RuntimeError("BACKUP_CHECKSUM_MISMATCH")
            tmp = path.with_name("." + path.name + ".growth-recover")
            shutil.copyfile(copy, tmp)
            os.chown(tmp, 0, 0)
            os.chmod(tmp, 0o600 if path in APPROVALS else 0o644)
            os.replace(tmp, path)
        systemctl("daemon-reload")
        check_config(state["oldPins"], held=True)
        watchdog = "saytwist-growth-lease-watchdog.timer"
        if state["timers"][watchdog]["enabled"]:
            systemctl("start", "saytwist-growth-lease-watchdog.service")
            if systemctl("show", "-P", "Result", "saytwist-growth-lease-watchdog.service") != "success":
                raise RuntimeError("WATCHDOG_START_FAILED")
        for timer in TIMERS:
            original = state["timers"][timer]
            if original["enabled"]:
                systemctl("enable", timer)
            if original["active"]:
                systemctl("start", timer)
        for timer in TIMERS:
            original = state["timers"][timer]
            enabled = systemctl("is-enabled", timer, check=False) == "enabled"
            active = systemctl("is-active", timer, check=False) == "active"
            if enabled != original["enabled"] or active != original["active"]:
                raise RuntimeError("GROWTH_TIMER_RESTORE_FAILED")
        check_config(state["oldPins"], held=False)
        assert_safe_database(state["pendingSha256"])
        state["status"] = "RECOVERED"
        archive_state(state, "recovered")
    except Exception:
        systemctl("disable", "--now", *TIMERS, check=False, capture=False)
        state["status"] = "FAILED_HELD"
        write_state(state)
        raise
    print("GROWTH_DEPLOY_TIMERS=RECOVERED_14")


def audit(release_sha):
    if (APP / ".deployed-release").read_text().strip() != release_sha:
        raise RuntimeError("DEPLOYED_RELEASE_MISMATCH")
    pending = assert_safe_database()
    pins = {name: service_release(name, (UNIT_DIR / ("saytwist-growth-" + name + ".service")).read_text())
            for name in NAMES}
    if any(pins[name] != release_sha for name in NAMES if name not in ("v2-courier", "v2-intelligence")):
        raise RuntimeError("ACTIVE_TIMER_RELEASE_PIN_MISMATCH")
    check_config(pins, held=False)
    run(["curl", "--fail", "--silent", "--show-error", "--max-time", "5",
         "http://127.0.0.1:3001/api/healthz"])
    run(["curl", "--fail", "--silent", "--show-error", "--max-time", "5",
         "http://127.0.0.1:3001/api/readyz"])
    active = sum(systemctl("is-active", timer, check=False) == "active" for timer in TIMERS)
    enabled = sum(systemctl("is-enabled", timer, check=False) == "enabled" for timer in TIMERS)
    print("GROWTH_DEPLOY_COORDINATOR_AUDIT=PASSED")
    print("GROWTH_DEPLOY_RELEASE_SHA=" + release_sha)
    print("GROWTH_TIMERS_ENABLED=" + str(enabled) + "/14")
    print("GROWTH_TIMERS_ACTIVE=" + str(active) + "/14")
    print("PENDING_QUEUE_SHA256=" + pending)


def main():
    if os.getuid() != 0 or len(sys.argv) != 3:
        raise RuntimeError("ROOT_AND_EXACT_ARGUMENTS_REQUIRED")
    action, sha = sys.argv[1:]
    if action == "hold":
        hold(sha)
    elif action == "audit":
        audit(sha)
    elif action == "restore":
        restore(sha)
    elif action == "recover":
        recover(sha)
    else:
        raise RuntimeError("ACTION_INVALID")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        # Do not print SQL, environment values, paths from secrets, or provider data.
        code = str(error) if re.fullmatch(r"[A-Z0-9_]{1,64}", str(error)) else "CHECK_FAILED"
        print("GROWTH_DEPLOY_COORDINATOR=BLOCKED " + code, file=sys.stderr)
        sys.exit(1)
