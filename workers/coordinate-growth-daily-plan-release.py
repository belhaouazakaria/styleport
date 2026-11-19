#!/usr/bin/env python3
"""Root-only 14-timer hold and restore for the daily Growth plan release."""
import hashlib
import json
import os
import pathlib
import re
import stat
import subprocess
import sys
import tarfile
import tempfile

OLD = "610b55e0ee0a36ce2ba67245dc34ed8d195030b2"
APP = pathlib.Path("/home/saytwist/htdocs/saytwist.com")
BASE = pathlib.Path("/etc/systemd/system")
STATE = pathlib.Path("/etc/saytwist-growth-daily-plan-release-state.json")
NAMES = "lease-watchdog daily-observe autonomous-cycle approved-publisher daily-fresh private-report autonomous-content daily-account-analytics auto-translator-publish viral-discovery viral-source pin-maintenance v2-courier v2-intelligence".split()
TIMERS = ["saytwist-growth-" + name + ".timer" for name in NAMES]
WORK_TIMERS = [timer for timer in TIMERS if timer != "saytwist-growth-lease-watchdog.timer"]
PRIVATE = [pathlib.Path(p) for p in (
    "/etc/saytwist-growth-viral-source-approval.env",
    "/etc/saytwist/growth-v2-courier.env",
    "/etc/saytwist/growth-v2-intelligence.env",
    "/etc/saytwist-growth-private-report.env",
)]
FILES = [BASE / ("saytwist-growth-" + name + suffix) for name in NAMES for suffix in (".service", ".timer")]
FILES += [BASE / "saytwist-growth-v2-alert@.service", *PRIVATE]
CALENDARS = {
    "saytwist-growth-auto-translator-publish.timer": ("06:57:00", "06:30:00"),
    "saytwist-growth-autonomous-content.timer": ("06:30:00", "06:00:00"),
    "saytwist-growth-daily-fresh.timer": ("07:02:00", "06:45:00"),
    "saytwist-growth-viral-discovery.timer": ("08:15:00", "05:30:00"),
}
mutating = False


def run(args, *, check=True):
    result = subprocess.run(args, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if check and result.returncode:
        raise RuntimeError("COMMAND_FAILED:" + args[0])
    return result.stdout.strip(), result.returncode


def trusted(path, mode):
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_gid != 0 or stat.S_IMODE(info.st_mode) != mode:
        raise RuntimeError("UNTRUSTED_FILE")


def database(migrations):
    count, _ = run(["runuser", "-u", "postgres", "--", "/usr/lib/postgresql/18/bin/psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-p", "5433", "-d", "saytwist", "-c", 'SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;'])
    if count != str(migrations):
        raise RuntimeError("MIGRATION_COUNT")
    state, _ = run(["runuser", "-u", "postgres", "--", "/usr/lib/postgresql/18/bin/psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-p", "5433", "-d", "saytwist", "-c", 'SELECT CASE WHEN count(*)=1 AND bool_and(NOT "enabled" AND NOT "attributionEnabled") THEN \'OFF\' ELSE \'BLOCKED\' END FROM "GrowthSettings" WHERE id=\'global\';'])
    lease, _ = run(["runuser", "-u", "postgres", "--", "/usr/lib/postgresql/18/bin/psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-p", "5433", "-d", "saytwist", "-c", 'SELECT CASE WHEN count(*)=1 AND bool_and("workerActivationExpiresAt" IS NULL) THEN \'CLEAR\' ELSE \'BLOCKED\' END FROM "GrowthSettings" WHERE id=\'global\';'])
    jobs, _ = run(["runuser", "-u", "postgres", "--", "/usr/lib/postgresql/18/bin/psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-p", "5433", "-d", "saytwist", "-c", 'SELECT count(*) FROM "GrowthJob" WHERE status IN (\'CLAIMED\',\'RUNNING\',\'FAILED_RETRYABLE\');'])
    pending, _ = run(["runuser", "-u", "postgres", "--", "/usr/lib/postgresql/18/bin/psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-p", "5433", "-d", "saytwist", "-c", 'SELECT COALESCE(json_agg(json_build_array(id,type,status,"runAfter","attemptCount","maxAttempts","idempotencyKey",payload) ORDER BY id),\'[]\'::json)::text FROM "GrowthJob" WHERE status=\'PENDING\';'])
    if state != "OFF" or lease != "CLEAR" or jobs != "0":
        raise RuntimeError("GROWTH_NOT_IDLE")
    return hashlib.sha256(pending.encode()).hexdigest()


def enabled(timer):
    output, code = run(["systemctl", "is-enabled", timer], check=False)
    return output if code == 0 else output or "disabled"


def active(unit):
    output, code = run(["systemctl", "is-active", unit], check=False)
    return output == "active" and code == 0


def config_state(sha, should_be_active):
    for path in FILES:
        trusted(path, 0o600 if path in PRIVATE else 0o644)
    for name in NAMES:
        service = "saytwist-growth-" + name + ".service"
        timer = "saytwist-growth-" + name + ".timer"
        key = "WATCHDOG_EXPECTED_RELEASE_SHA" if name == "lease-watchdog" else "EXPECTED_RELEASE"
        source = (BASE / service).read_text()
        if source.count(f"Environment={key}={sha}") != 1:
            raise RuntimeError("SERVICE_SHA_PIN")
        effective = run(["systemctl", "show", "-P", "Environment", service])[0].split()
        if f"{key}={sha}" not in effective:
            raise RuntimeError("EFFECTIVE_SERVICE_SHA_PIN")
        if run(["systemctl", "show", "-P", "User", service])[0] != "saytwist":
            raise RuntimeError("SERVICE_USER")
        if run(["systemctl", "show", "-P", "DropInPaths", service])[0] or run(["systemctl", "show", "-P", "DropInPaths", timer])[0]:
            raise RuntimeError("UNIT_DROPIN")
        if active(service) and name != "lease-watchdog":
            raise RuntimeError("SERVICE_RUNNING")
        if name == "lease-watchdog":
            if not active(timer) or not enabled(timer).startswith("enabled"):
                raise RuntimeError("WATCHDOG_NOT_ACTIVE_AND_ENABLED")
        elif active(timer) != should_be_active:
            raise RuntimeError("TIMER_ACTIVE_STATE")
        if timer in CALENDARS:
            expected_time = CALENDARS[timer][1 if sha != OLD else 0]
            content = (BASE / timer).read_text()
            if content.count(f"OnCalendar=*-*-* {expected_time} UTC") != 1:
                raise RuntimeError("TIMER_CALENDAR")
    alert = (BASE / "saytwist-growth-v2-alert@.service").read_text()
    if f"EXPECTED_RELEASE={sha}" not in alert:
        raise RuntimeError("ALERT_SHA_PIN")
    for text, path in (("SAYTWIST_VIRAL_SOURCE:" + sha, PRIVATE[0]), ("SAYTWIST_V2:courier:" + sha, PRIVATE[1]), ("SAYTWIST_V2:intelligence:" + sha, PRIVATE[2])):
        if text not in path.read_text():
            raise RuntimeError("PRIVATE_APPROVAL_SHA")


def digests():
    return {str(path): hashlib.sha256(path.read_bytes()).hexdigest() for path in FILES}


def save_state(state):
    tmp = STATE.with_suffix(".tmp")
    tmp.write_text(json.dumps(state, sort_keys=True) + "\n")
    os.chown(tmp, 0, 0)
    os.chmod(tmp, 0o600)
    os.replace(tmp, STATE)


def timers(command, selected=None):
    for timer in selected or TIMERS:
        run(["systemctl", command, timer])


def main():
    global mutating
    if os.getuid() != 0 or len(sys.argv) != 3:
        raise RuntimeError("ROOT_AND_MODE_REQUIRED")
    trusted(pathlib.Path(__file__), 0o700)
    mode, new = sys.argv[1:]
    if mode not in {"audit", "hold", "restore", "recover"} or not re.fullmatch(r"[a-f0-9]{40}", new) or new == OLD:
        raise RuntimeError("BAD_MODE_OR_SHA")
    if mode in {"audit", "hold"}:
        if APP.joinpath(".deployed-release").read_text().strip() != OLD:
            raise RuntimeError("OLD_RELEASE_MISMATCH")
        queue_hash = database(41)
        config_state(OLD, True)
        if mode == "audit":
            print("DAILY_PLAN_AUDIT=PASSED_41_MIGRATIONS_14_TIMERS")
            return
        if os.environ.get("GROWTH_DAILY_PLAN_RELEASE_APPROVAL") != f"HOLD:{OLD}:{new}" or STATE.exists():
            raise RuntimeError("EXACT_HOLD_APPROVAL_OR_STATE")
        enabled_state = {timer: enabled(timer) for timer in TIMERS}
        archive = pathlib.Path(f"/root/saytwist-growth-daily-plan-units-{new[:12]}.tar.gz")
        if archive.exists():
            raise RuntimeError("BACKUP_EXISTS")
        with tarfile.open(archive, "w:gz") as tar:
            for path in FILES:
                tar.add(path, arcname=str(path).lstrip("/"))
        os.chown(archive, 0, 0)
        os.chmod(archive, 0o600)
        state = {"old": OLD, "new": new, "migrations": 41, "archive": str(archive), "digests": digests(), "enabled": enabled_state, "pendingQueueSha256": queue_hash, "status": "HOLDING"}
        save_state(state)
        mutating = True
        run(["systemctl", "stop", *WORK_TIMERS])
        disable = [timer for timer, value in enabled_state.items() if timer != "saytwist-growth-lease-watchdog.timer" and value.startswith("enabled")]
        if disable:
            run(["systemctl", "disable", *disable])
        for timer in WORK_TIMERS:
            if active(timer):
                raise RuntimeError("TIMER_STILL_ACTIVE")
        if database(41) != queue_hash:
            raise RuntimeError("PENDING_QUEUE_CHANGED_DURING_HOLD")
        state["status"] = "HELD"
        save_state(state)
        print("DAILY_PLAN_HOLD=PASSED_13_WORK_TIMERS_STOPPED_WATCHDOG_ACTIVE")
        return

    trusted(STATE, 0o600)
    state = json.loads(STATE.read_text())
    if state.get("old") != OLD or state.get("new") != new or state.get("status") not in {"HELD", "PARTIAL"}:
        raise RuntimeError("HOLD_STATE_MISMATCH")
    archive = pathlib.Path(state["archive"])
    trusted(archive, 0o600)
    if mode == "recover":
        if APP.joinpath(".deployed-release").read_text().strip() != OLD:
            raise RuntimeError("RECOVER_REQUIRES_OLD_APP")
        if database(41) != state.get("pendingQueueSha256"):
            raise RuntimeError("PENDING_QUEUE_CHANGED_DURING_RECOVERY")
        with tarfile.open(archive, "r:gz") as tar:
            expected = {str(path).lstrip("/") for path in FILES}
            members = tar.getmembers()
            if {member.name for member in members} != expected or any(not member.isfile() for member in members):
                raise RuntimeError("BAD_CONFIG_ARCHIVE")
            for member in members:
                target = pathlib.Path("/") / member.name
                source = tar.extractfile(member)
                if source is None:
                    raise RuntimeError("BAD_CONFIG_ARCHIVE")
                temp = target.with_suffix(target.suffix + ".recover-tmp")
                temp.write_bytes(source.read())
                os.chown(temp, 0, 0)
                os.chmod(temp, 0o600 if target in PRIVATE else 0o644)
                os.replace(temp, target)
        run(["systemctl", "daemon-reload"])
    else:
        if os.environ.get("GROWTH_DAILY_PLAN_RELEASE_APPROVAL") != f"RESTORE:{OLD}:{new}":
            raise RuntimeError("EXACT_RESTORE_APPROVAL")
        if APP.joinpath(".deployed-release").read_text().strip() != new:
            raise RuntimeError("NEW_RELEASE_MISMATCH")
        if database(42) != state.get("pendingQueueSha256"):
            raise RuntimeError("PENDING_QUEUE_CHANGED_DURING_DEPLOY")
        if any(active(timer) for timer in WORK_TIMERS):
            raise RuntimeError("TIMERS_NOT_HELD")
        if not active("saytwist-growth-lease-watchdog.timer"):
            raise RuntimeError("WATCHDOG_TIMER_NOT_ACTIVE")
        if digests() != state["digests"]:
            raise RuntimeError("UNIT_FILES_CHANGED_DURING_HOLD")
        for path in FILES:
            content = path.read_text()
            if path.name.endswith(".timer") and path.name in CALENDARS:
                old_time, new_time = CALENDARS[path.name]
                old_calendar = f"OnCalendar=*-*-* {old_time} UTC"
                if content.count(old_calendar) != 1:
                    raise RuntimeError("TIMER_CALENDAR_MISMATCH")
                content = content.replace(old_calendar, f"OnCalendar=*-*-* {new_time} UTC")
            content = content.replace(OLD, new)
            if content == path.read_text():
                continue
            fd, name = tempfile.mkstemp(prefix=".growth-plan-", dir=str(path.parent))
            with os.fdopen(fd, "w") as handle:
                handle.write(content)
            os.chown(name, 0, 0)
            os.chmod(name, 0o600 if path in PRIVATE else 0o644)
            os.replace(name, path)
        run(["systemctl", "daemon-reload"])

    mutating = True
    if mode == "recover":
        new = OLD
    # Preserve the exact enabled/disabled installation state recorded at hold.
    for timer, value in state["enabled"].items():
        if value.startswith("enabled"):
            run(["systemctl", "enable", timer])
        else:
            run(["systemctl", "disable", timer], check=False)
        run(["systemctl", "start", timer])
    config_state(new, True)
    for timer, value in state["enabled"].items():
        if enabled(timer) != value:
            raise RuntimeError("TIMER_ENABLEMENT_CHANGED")
    state["status"] = "RECOVERED" if mode == "recover" else "RESTORED"
    save_state(state)
    print("DAILY_PLAN_" + state["status"] + "=PASSED_14_TIMERS_ENABLED")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        if mutating:
            subprocess.run(["systemctl", "stop", *WORK_TIMERS], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            try:
                if STATE.exists():
                    partial = json.loads(STATE.read_text())
                    partial["status"] = "PARTIAL"
                    save_state(partial)
            except Exception:
                pass
            print("DAILY_PLAN_RELEASE=PARTIAL_TIMERS_STOPPED " + type(error).__name__ + ": " + str(error), file=sys.stderr)
        else:
            print("DAILY_PLAN_RELEASE=BLOCKED " + type(error).__name__ + ": " + str(error), file=sys.stderr)
        sys.exit(1)
