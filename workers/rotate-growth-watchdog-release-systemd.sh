#!/usr/bin/env bash
set -Eeuo pipefail
# Rotates the existing root-owned watchdog service to an exactly deployed SHA.
# Must be run from a separately checksum-verified root-owned 0700 copy.
# The OBSERVE timer must already be disabled; the watchdog timer must be
# stopped (but remain enabled) before the protected application deployment.
fail() { echo "WATCHDOG_SHA_ROTATION=BLOCKED" >&2; exit 1; }
[[ "$(id -u)" == "0" && "$#" == "2" ]] || fail
[[ -f "$0" && ! -L "$0" && "$(stat -c '%u:%g:%a' "$0")" == "0:0:700" ]] || fail
OLD="$1"
NEW="$2"
[[ "$OLD" =~ ^[a-f0-9]{40}$ && "$NEW" =~ ^[a-f0-9]{40}$ && "$OLD" != "$NEW" ]] || fail

APP=/home/saytwist/htdocs/saytwist.com
BASE=/etc/systemd/system
SVC=saytwist-growth-lease-watchdog.service
TMR=saytwist-growth-lease-watchdog.timer
ALERT=saytwist-growth-lease-watchdog-alert.service
OBSERVE=saytwist-growth-daily-observe.timer

[[ "$(cat "$APP/.deployed-release")" == "$NEW" ]] || fail
[[ -f "$APP/workers/growth-lease-watchdog-launch.cjs" &&
   -f "$APP/workers/growth-lease-watchdog.ts" ]] || fail

for name in "$SVC" "$TMR" "$ALERT"; do
  f="$BASE/$name"
  [[ -f "$f" && ! -L "$f" && "$(stat -c '%u:%g:%a' "$f")" == "0:0:644" ]] || fail
done
[[ "$(systemctl is-enabled "$TMR" 2>/dev/null || true)" == "enabled" ]] || fail
[[ "$(systemctl is-active "$TMR" 2>/dev/null || true)" != "active" ]] || fail
[[ "$(systemctl is-active "$SVC" 2>/dev/null || true)" != "active" ]] || fail
[[ "$(systemctl is-enabled "$OBSERVE" 2>/dev/null || true)" != "enabled" ]] || fail
[[ "$(systemctl is-active "$OBSERVE" 2>/dev/null || true)" != "active" ]] || fail
[[ "$(grep -Fxc "Environment=WATCHDOG_EXPECTED_RELEASE_SHA=$OLD" "$BASE/$SVC")" == "1" ]] || fail
[[ "$(grep -Fxc "OnFailure=$ALERT" "$BASE/$SVC")" == "1" ]] || fail

TMP="$(mktemp "$BASE/.watchdog-sha-rotation.XXXXXXXX")"
trap 'rm -f "$TMP"' EXIT
sed "s/Environment=WATCHDOG_EXPECTED_RELEASE_SHA=$OLD/Environment=WATCHDOG_EXPECTED_RELEASE_SHA=$NEW/" \
  "$BASE/$SVC" > "$TMP"
chown root:root "$TMP"
chmod 0644 "$TMP"
mv "$TMP" "$BASE/$SVC"
systemctl daemon-reload
systemd-analyze verify "$BASE/$SVC" "$BASE/$TMR" "$BASE/$ALERT" || fail
[[ "$(grep -Fxc "Environment=WATCHDOG_EXPECTED_RELEASE_SHA=$NEW" "$BASE/$SVC")" == "1" ]] || fail

# Run only the independent expiry watchdog, never any Growth worker.
# On failure leave the timer stopped and alert the operator.
if ! systemctl start "$SVC" ||
   [[ "$(systemctl show -P Result "$SVC")" != "success" ]]; then
  echo "WATCHDOG_SHA_ROTATION=SERVICE_FAILED" >&2
  exit 1
fi
systemctl start "$TMR" || fail
systemctl is-active --quiet "$TMR" || fail
systemctl is-enabled --quiet "$TMR" || fail
echo "WATCHDOG_SHA_ROTATION=PASSED"
echo "WATCHDOG_TIMER=ACTIVE"
echo "WATCHDOG_RELEASE=$NEW"
