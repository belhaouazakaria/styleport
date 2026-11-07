#!/usr/bin/env bash
set -Eeuo pipefail
# Protected-release SHA rotation for the existing approved-Pin publisher.
# Run only as root from a separately reviewed root-owned 0700 private copy.
# This does NOT enable the timer, run a publisher job or grant Pin approval.
fail() { echo "APPROVED_PUBLISHER_ROTATION=BLOCKED" >&2; exit 1; }

[[ "$(id -u)" == "0" && "$#" == 2 ]] || fail
[[ -f "$0" && ! -L "$0" && "$(stat -c '%u:%g:%a' "$0")" == "0:0:700" ]] || fail
OLD="$1"
NEW="$2"
[[ "$OLD" =~ ^[a-f0-9]{40}$ && "$NEW" =~ ^[a-f0-9]{40}$ && "$OLD" != "$NEW" ]] || fail

APP=/home/saytwist/htdocs/saytwist.com
DIR=/etc/systemd/system
SVC=saytwist-growth-approved-publisher.service
TIMER=saytwist-growth-approved-publisher.timer
ALERT=saytwist-growth-approved-publisher-alert.service

[[ "$(cat "$APP/.deployed-release")" == "$NEW" ]] || fail
[[ -f "$APP/workers/growth-approved-publisher-launch.cjs" ]] || fail

for unit in "$SVC" "$TIMER" "$ALERT"; do
  file="$DIR/$unit"
  [[ -f "$file" && ! -L "$file" && "$(stat -c '%u:%g:%a' "$file")" == "0:0:644" ]] || fail
  [[ -z "$(systemctl show -P DropInPaths "$unit")" ]] || fail
done

[[ "$(systemctl is-enabled "$TIMER" 2>/dev/null || true)" == "disabled" ]] || fail
[[ "$(systemctl is-active "$TIMER" 2>/dev/null || true)" != "active" ]] || fail
[[ "$(systemctl is-active "$SVC" 2>/dev/null || true)" != "active" ]] || fail
[[ "$(systemctl show -P User "$SVC")" == "saytwist" ]] || fail
[[ "$(systemctl show -P OnFailure "$SVC")" == "$ALERT" ]] || fail
[[ "$(grep -Fxc "Environment=EXPECTED_RELEASE=$OLD" "$DIR/$SVC")" == 1 ]] || fail
[[ "$(grep -Fxc 'Environment=GROWTH_APPROVED_PUBLISHER_LAUNCH=true' "$DIR/$SVC")" == 1 ]] || fail
[[ "$(grep -Fxc 'OnCalendar=*-*-* *:00/5:00 UTC' "$DIR/$TIMER")" == 1 ]] || fail
[[ "$(grep -Fxc 'Persistent=false' "$DIR/$TIMER")" == 1 ]] || fail

# The watchdog and both legacy daily timers must have been rotated and
# independently re-enabled to the new release before publisher rotation.
for timer in \
  saytwist-growth-lease-watchdog.timer \
  saytwist-growth-daily-observe.timer \
  saytwist-growth-autonomous-cycle.timer; do
  systemctl is-active --quiet "$timer" || fail
  systemctl is-enabled --quiet "$timer" || fail
done
[[ "$(systemctl show -P Result saytwist-growth-lease-watchdog.service)" == "success" ]] || fail
systemctl show -P Environment saytwist-growth-lease-watchdog.service |
  grep -Fq "WATCHDOG_EXPECTED_RELEASE_SHA=$NEW" || fail
for service in saytwist-growth-daily-observe.service saytwist-growth-autonomous-cycle.service; do
  systemctl show -P Environment "$service" | grep -Fq "EXPECTED_RELEASE=$NEW" || fail
done

TMP="$(mktemp "$DIR/.approved-publisher-sha-rotation.XXXXXXXX")"
trap 'rm -f "$TMP"' EXIT
sed "s/^Environment=EXPECTED_RELEASE=$OLD$/Environment=EXPECTED_RELEASE=$NEW/" \
  "$DIR/$SVC" > "$TMP"
chown root:root "$TMP"
chmod 0644 "$TMP"
mv "$TMP" "$DIR/$SVC"
systemctl daemon-reload
systemd-analyze verify "$DIR/$SVC" "$DIR/$TIMER" "$DIR/$ALERT" || fail
[[ "$(grep -Fxc "Environment=EXPECTED_RELEASE=$NEW" "$DIR/$SVC")" == 1 ]] || fail
systemctl show -P Environment "$SVC" | grep -Fq "EXPECTED_RELEASE=$NEW" || fail
[[ "$(systemctl is-enabled "$TIMER" 2>/dev/null || true)" == "disabled" ]] || fail
[[ "$(systemctl is-active "$TIMER" 2>/dev/null || true)" != "active" ]] || fail
echo "APPROVED_PUBLISHER_ROTATION=READY_DISABLED"
echo "APPROVED_PUBLISHER_RELEASE=$NEW"
echo "APPROVED_PUBLISHER_TIMER=INACTIVE"
