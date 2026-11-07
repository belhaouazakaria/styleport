#!/usr/bin/env bash
set -Eeuo pipefail
# Rotate ONLY the already installed, disabled Phase14M AI service release pin.
# Must run as root from a separately reviewed root-owned 0700 copy.
# Never enable/start the AI timer or run AI generation.
fail() { echo "GROWTH_DAILY_FRESH_ROTATION=BLOCKED" >&2; exit 1; }

[[ "$(id -u)" == 0 && "$#" == 2 ]] || fail
[[ -f "$0" && ! -L "$0" && "$(stat -c '%u:%g:%a' "$0")" == "0:0:700" ]] || fail
OLD="$1"
NEW="$2"
[[ "$OLD" =~ ^[a-f0-9]{40}$ && "$NEW" =~ ^[a-f0-9]{40}$ && "$OLD" != "$NEW" ]] || fail

APP=/home/saytwist/htdocs/saytwist.com
DIR=/etc/systemd/system
SVC=saytwist-growth-daily-fresh.service
TIMER=saytwist-growth-daily-fresh.timer
ALERT=saytwist-growth-daily-fresh-alert.service
AI_ENV=/etc/saytwist-growth-ai.env

[[ "$(cat "$APP/.deployed-release")" == "$NEW" ]] || fail
[[ -f "$APP/workers/growth-daily-fresh-launch.cjs" &&
   -f "$APP/workers/growth-daily-fresh-creatives.ts" ]] || fail
[[ -f "$AI_ENV" && ! -L "$AI_ENV" &&
   "$(stat -c '%u:%g:%a' "$AI_ENV")" == "0:0:600" ]] || fail
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
[[ "$(grep -Fxc 'Environment=GROWTH_DAILY_FRESH_LAUNCH=true' "$DIR/$SVC")" == 1 ]] || fail
[[ "$(grep -Fxc "EnvironmentFile=$AI_ENV" "$DIR/$SVC")" == 1 ]] || fail
[[ "$(grep -Fxc 'OnCalendar=*-*-* 07:02:00 UTC' "$DIR/$TIMER")" == 1 ]] || fail
[[ "$(grep -Fxc 'Persistent=false' "$DIR/$TIMER")" == 1 ]] || fail

for timer in \
  saytwist-growth-lease-watchdog.timer \
  saytwist-growth-daily-observe.timer \
  saytwist-growth-autonomous-cycle.timer \
  saytwist-growth-approved-publisher.timer; do
  systemctl is-active --quiet "$timer" || fail
  systemctl is-enabled --quiet "$timer" || fail
done
[[ "$(systemctl show -P Result saytwist-growth-lease-watchdog.service)" == "success" ]] || fail
systemctl show -P Environment saytwist-growth-lease-watchdog.service |
  grep -Fq "WATCHDOG_EXPECTED_RELEASE_SHA=$NEW" || fail
for service in \
  saytwist-growth-daily-observe.service \
  saytwist-growth-autonomous-cycle.service \
  saytwist-growth-approved-publisher.service; do
  systemctl show -P Environment "$service" | grep -Fq "EXPECTED_RELEASE=$NEW" || fail
done

TMP="$(mktemp "$DIR/.daily-fresh-release-rotation.XXXXXXXX")"
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
echo "GROWTH_DAILY_FRESH_ROTATION=READY_DISABLED"
echo "GROWTH_DAILY_FRESH_RELEASE=$NEW"
echo "GROWTH_DAILY_FRESH_TIMER=INACTIVE"
