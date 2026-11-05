#!/usr/bin/env bash
set -Eeuo pipefail
# Rotate the existing root-owned daily local Growth intelligence service pin
# after a protected release. Never enables timers or runs a Growth worker.
# Must be executed from a separately reviewed root-owned 0700 copy.
fail() { echo "GROWTH_CYCLE_ROTATION=BLOCKED" >&2; exit 1; }
[[ "$(id -u)" == 0 && "$#" == 2 ]] || fail
[[ -f "$0" && ! -L "$0" && "$(stat -c '%u:%g:%a' "$0")" == "0:0:700" ]] || fail
OLD="$1"
NEW="$2"
[[ "$OLD" =~ ^[a-f0-9]{40}$ && "$NEW" =~ ^[a-f0-9]{40}$ && "$OLD" != "$NEW" ]] || fail

APP=/home/saytwist/htdocs/saytwist.com
DIR=/etc/systemd/system
SVC=saytwist-growth-autonomous-cycle.service
TIMER=saytwist-growth-autonomous-cycle.timer
ALERT=saytwist-growth-autonomous-cycle-alert.service
WATCHDOG=saytwist-growth-lease-watchdog.service
WATCHDOG_TIMER=saytwist-growth-lease-watchdog.timer
OBSERVE=saytwist-growth-daily-observe.service
OBSERVE_TIMER=saytwist-growth-daily-observe.timer

[[ "$(cat "$APP/.deployed-release")" == "$NEW" ]] || fail
for name in "$SVC" "$TIMER" "$ALERT"; do
  f="$DIR/$name"
  [[ -f "$f" && ! -L "$f" && "$(stat -c '%u:%g:%a' "$f")" == "0:0:644" ]] || fail
  [[ -z "$(systemctl show -P DropInPaths "$name")" ]] || fail
done

# The daily timer is a separate, owner-approved opt-in. Keep it stopped while
# rewriting the service. Do not alter or trigger a calendar event.
[[ "$(systemctl is-enabled "$TIMER" 2>/dev/null || true)" == "disabled" ]] || fail
[[ "$(systemctl is-active "$TIMER" 2>/dev/null || true)" != "active" ]] || fail
[[ "$(systemctl is-active "$SVC" 2>/dev/null || true)" != "active" ]] || fail
[[ "$(systemctl show -P User "$SVC")" == "saytwist" ]] || fail
[[ "$(systemctl show -P OnFailure "$SVC")" == "$ALERT" ]] || fail
[[ "$(grep -Fxc "Environment=EXPECTED_RELEASE=$OLD" "$DIR/$SVC")" == "1" ]] || fail
[[ "$(grep -Fxc "Environment=GROWTH_AUTONOMOUS_CYCLE_LAUNCH=true" "$DIR/$SVC")" == "1" ]] || fail
[[ "$(grep -Fxc 'OnCalendar=*-*-* 04:30:00 UTC' "$DIR/$TIMER")" == "1" ]] || fail
[[ "$(grep -Fxc 'Persistent=false' "$DIR/$TIMER")" == "1" ]] || fail

# Require the independent watchdog already healthy on the new release.
systemctl is-active --quiet "$WATCHDOG_TIMER" || fail
[[ "$(systemctl show -P Result "$WATCHDOG")" == "success" ]] || fail
[[ "$(systemctl show -P OnFailure "$WATCHDOG")" == "saytwist-growth-lease-watchdog-alert.service" ]] || fail
systemctl show -P Environment "$WATCHDOG" |
  grep -Fq "WATCHDOG_EXPECTED_RELEASE_SHA=$NEW" || fail

# OBSERVE has already been rotated to the new SHA but remains safely disabled
# during the coordinated release. It is separately enabled after the audit.
[[ "$(systemctl is-enabled "$OBSERVE_TIMER" 2>/dev/null || true)" == "disabled" ]] || fail
[[ "$(systemctl is-active "$OBSERVE_TIMER" 2>/dev/null || true)" != "active" ]] || fail
[[ "$(systemctl is-active "$OBSERVE" 2>/dev/null || true)" != "active" ]] || fail
[[ "$(systemctl show -P Result "$OBSERVE")" == "success" ]] || fail
[[ -z "$(systemctl show -P DropInPaths "$OBSERVE")" ]] || fail
systemctl show -P Environment "$OBSERVE" |
  grep -Fq "EXPECTED_RELEASE=$NEW" || fail

TMP="$(mktemp "$DIR/.growth-cycle-sha-rotation.XXXXXXXX")"
trap 'rm -f "$TMP"' EXIT
sed "s/^Environment=EXPECTED_RELEASE=$OLD$/Environment=EXPECTED_RELEASE=$NEW/" \
  "$DIR/$SVC" > "$TMP"
chown root:root "$TMP"
chmod 0644 "$TMP"
mv "$TMP" "$DIR/$SVC"
systemctl daemon-reload
systemd-analyze verify "$DIR/$SVC" "$DIR/$TIMER" "$DIR/$ALERT" || fail
[[ "$(grep -Fxc "Environment=EXPECTED_RELEASE=$NEW" "$DIR/$SVC")" == "1" ]] || fail
systemctl show -P Environment "$SVC" |
  grep -Fq "EXPECTED_RELEASE=$NEW" || fail
[[ "$(systemctl show -P OnFailure "$SVC")" == "$ALERT" ]] || fail
[[ "$(systemctl is-enabled "$TIMER" 2>/dev/null || true)" == "disabled" ]] || fail
[[ "$(systemctl is-active "$TIMER" 2>/dev/null || true)" != "active" ]] || fail
echo "GROWTH_CYCLE_ROTATION=READY_DISABLED"
echo "GROWTH_CYCLE_RELEASE=$NEW"
echo "GROWTH_CYCLE_TIMER=INACTIVE"
