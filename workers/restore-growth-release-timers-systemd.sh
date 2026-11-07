#!/usr/bin/env bash
set -Eeuo pipefail
# One root-authorized, fail-closed restore of the already approved SayTwist
# watchdog, OBSERVE, intelligence and approved-Pin publisher after a protected
# exact-SHA app deploy. Phase14M paid AI timer is ROTATED BUT NEVER STARTED.
# Run only a separately verified root-owned 0700 copy; no dynamic downloads.
fail() { echo "GROWTH_RELEASE_RESTORE=BLOCKED" >&2; exit 1; }
[[ "$(id -u)" == "0" && "$#" == 2 ]] || fail
[[ -f "$0" && ! -L "$0" && "$(stat -c '%u:%g:%a' "$0")" == "0:0:700" ]] || fail
OLD="$1"
NEW="$2"
[[ "$OLD" =~ ^[a-f0-9]{40}$ && "$NEW" =~ ^[a-f0-9]{40}$ && "$OLD" != "$NEW" ]] || fail

APP=/home/saytwist/htdocs/saytwist.com
BASE=/etc/systemd/system
WATCH=saytwist-growth-lease-watchdog
OBS=saytwist-growth-daily-observe
CYCLE=saytwist-growth-autonomous-cycle
PUB=saytwist-growth-approved-publisher
AI=saytwist-growth-daily-fresh
stage=PREFLIGHT
started=0
dir=""

# Any failure after rotation begins stops schedulers; watchdog stays enabled
# when available to revoke expired leases. No source/DB rollback is attempted.
on_exit() {
  local code="$?"
  if [[ "$code" != 0 && "$started" == 1 ]]; then
    systemctl disable --now "$PUB.timer" "$CYCLE.timer" "$OBS.timer" >/dev/null 2>&1 || :
    echo "GROWTH_RELEASE_RESTORE=PARTIAL_STOPPED" >&2
    echo "GROWTH_RELEASE_RESTORE_STAGE=$stage" >&2
  fi
  if [[ -n "$dir" ]]; then rm -rf -- "$dir"; fi
}
trap on_exit EXIT

safe_db() {
  [[ "$(runuser -u postgres -- /usr/lib/postgresql/18/bin/psql \
    -X -qAt -v ON_ERROR_STOP=1 -p 5433 -d saytwist \
    -c "SELECT CASE WHEN COUNT(*) = 1 AND
      bool_and(NOT \"enabled\" AND NOT \"attributionEnabled\"
      AND \"workerActivationExpiresAt\" IS NULL)
      THEN 'SAFE_OFF' ELSE 'BLOCKED' END
      FROM \"GrowthSettings\" WHERE id='global';")" == "SAFE_OFF" ]] || fail
}

pin() {
  local service="$1" variable="$2" sha="$3"
  [[ -f "$BASE/$service.service" && ! -L "$BASE/$service.service" &&
    "$(stat -c '%u:%g:%a' "$BASE/$service.service")" == "0:0:644" ]] || fail
  [[ "$(grep -Fxc "Environment=$variable=$sha" "$BASE/$service.service")" == 1 ]] || fail
}

disabled() {
  [[ "$(systemctl is-enabled "$1.timer" 2>/dev/null || true)" == "disabled" ]] || fail
  ! systemctl is-active --quiet "$1.timer" || fail
  ! systemctl is-active --quiet "$1.service" || fail
}

active() {
  systemctl is-enabled --quiet "$1.timer" || fail
  systemctl is-active --quiet "$1.timer" || fail
}

[[ "$(cat "$APP/.deployed-release")" == "$NEW" ]] || fail
curl -fsS --max-time 10 https://saytwist.com/api/readyz >/dev/null || fail
safe_db
pin "$WATCH" WATCHDOG_EXPECTED_RELEASE_SHA "$OLD"
for name in "$OBS" "$CYCLE" "$PUB" "$AI"; do pin "$name" EXPECTED_RELEASE "$OLD"; done
[[ "$(systemctl is-enabled "$WATCH.timer")" == enabled ]] || fail
! systemctl is-active --quiet "$WATCH.timer" || fail
for name in "$OBS" "$CYCLE" "$PUB" "$AI"; do disabled "$name"; done
! systemctl is-active --quiet "$WATCH.service" || fail

# Verify exact independently audited Git blob contents before privileged exec.
files=(
  "rotate-growth-watchdog-release-systemd.sh:030bade24793e53c6c275e51dd5a979b85858b87"
  "rotate-growth-daily-observe-systemd.sh:889343978f28fd1c6b0a4357de647651b8d9ea09"
  "rotate-growth-autonomous-cycle-systemd.sh:29b411f8ce527841b48fff148cf55cd21ebb250c"
  "rotate-growth-approved-publisher-release-systemd.sh:351ca5e10d3ffa50dbd74e86e6ba5cbc49c4e6ec"
  "rotate-growth-daily-fresh-release-systemd.sh:d9b7f9683a57d8d5cdc171510bea747af2d4af98"
)
dir="$(mktemp -d /root/saytwist-release-restore.XXXXXXXX)"
chmod 0700 "$dir"
for entry in "${files[@]}"; do
  file="${entry%%:*}"
  blob="${entry##*:}"
  src="$APP/workers/$file"
  [[ -f "$src" && ! -L "$src" ]] || fail
  [[ "$(git hash-object "$src")" == "$blob" ]] || fail
  install -o root -g root -m 0700 "$src" "$dir/$file"
  [[ "$(git hash-object "$dir/$file")" == "$blob" ]] || fail
  bash -n "$dir/$file" || fail
done

echo "GROWTH_RESTORE_PREFLIGHT=PASSED"
started=1
stage=WATCHDOG
"$dir/rotate-growth-watchdog-release-systemd.sh" "$OLD" "$NEW"
active "$WATCH"
pin "$WATCH" WATCHDOG_EXPECTED_RELEASE_SHA "$NEW"
safe_db

stage=OBSERVE
"$dir/rotate-growth-daily-observe-systemd.sh" "$OLD" "$NEW"
pin "$OBS" EXPECTED_RELEASE "$NEW"
disabled "$OBS"

stage=INTELLIGENCE
"$dir/rotate-growth-autonomous-cycle-systemd.sh" "$OLD" "$NEW"
pin "$CYCLE" EXPECTED_RELEASE "$NEW"
disabled "$CYCLE"
safe_db

stage=DAILY_RESTORE
systemctl enable --now "$OBS.timer" "$CYCLE.timer" >/dev/null
active "$OBS"
active "$CYCLE"

stage=PUBLISHER
"$dir/rotate-growth-approved-publisher-release-systemd.sh" "$OLD" "$NEW"
pin "$PUB" EXPECTED_RELEASE "$NEW"
disabled "$PUB"

# Never execute an approved-Pin publisher service during release rotation.
# Existing timed dispatch may run only on already individually APPROVED Pins.
stage=PUBLISHER_RESTORE
safe_db
systemctl enable --now "$PUB.timer" >/dev/null
active "$PUB"

stage=AI_DISABLED_ROTATION
"$dir/rotate-growth-daily-fresh-release-systemd.sh" "$OLD" "$NEW"
pin "$AI" EXPECTED_RELEASE "$NEW"
disabled "$AI"
safe_db

stage=POSTCONDITIONS
for name in "$WATCH" "$OBS" "$CYCLE" "$PUB"; do active "$name"; done
disabled "$AI"
[[ "$(cat "$APP/.deployed-release")" == "$NEW" ]] || fail
echo "GROWTH_RELEASE_RESTORE=PASSED"
echo "GROWTH_EXISTING_TIMERS=FOUR_ACTIVE"
echo "GROWTH_AI_TIMER=DISABLED"
echo "GROWTH_DB=SAFE_OFF"
