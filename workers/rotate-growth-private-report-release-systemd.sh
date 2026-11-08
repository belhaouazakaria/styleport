#!/usr/bin/env bash
set -Eeuo pipefail
# Rotate an ALREADY installed, temporarily stopped owner-approved Telegram
# daily report. Never sends a message, starts a service or enables the timer.
fail() { echo "PRIVATE_REPORT_ROTATION=BLOCKED" >&2; exit 1; }
[[ "$(id -u)" == 0 && "$#" == 2 ]] || fail
[[ -f "$0" && ! -L "$0" && "$(stat -c '%u:%g:%a' "$0")" == "0:0:700" ]] || fail
OLD="$1"
NEW="$2"
[[ "$OLD" =~ ^[a-f0-9]{40}$ && "$NEW" =~ ^[a-f0-9]{40}$ && "$OLD" != "$NEW" ]] || fail

APP=/home/saytwist/htdocs/saytwist.com
BASE=/etc/systemd/system
SVC=saytwist-growth-private-report.service
TIMER=saytwist-growth-private-report.timer
ENV=/etc/saytwist-growth-private-report.env
[[ "$(cat "$APP/.deployed-release")" == "$NEW" ]] || fail
[[ -f "$APP/workers/growth-private-report-launch.cjs" && -f "$APP/workers/growth-report-runner.ts" ]] || fail
[[ -f "$ENV" && ! -L "$ENV" && "$(stat -c '%u:%g:%a' "$ENV")" == "0:0:600" ]] || fail
[[ "$(wc -l < "$ENV")" == 4 ]] || fail
for line in TELEGRAM_REPORTS_ENABLED=true GROWTH_DAILY_REPORT_SCHEDULE_ENABLED=true; do
  grep -Fqx "$line" "$ENV" || fail
done
grep -Eq '^TELEGRAM_BOT_TOKEN=[1-9][0-9]{5,14}:[A-Za-z0-9_-]{30,}$' "$ENV" || fail
grep -Eq '^TELEGRAM_REPORT_CHAT_ID=[1-9][0-9]{4,15}$' "$ENV" || fail
for unit in "$SVC" "$TIMER"; do
  [[ -f "$BASE/$unit" && ! -L "$BASE/$unit" ]] || fail
  [[ "$(stat -c '%u:%g:%a' "$BASE/$unit")" == "0:0:644" ]] || fail
  [[ -z "$(systemctl show -P DropInPaths "$unit")" ]] || fail
done
[[ "$(systemctl is-enabled "$TIMER" 2>/dev/null || true)" == disabled ]] || fail
! systemctl is-active --quiet "$TIMER" || fail
! systemctl is-active --quiet "$SVC" || fail
[[ "$(systemctl show -P User "$SVC")" == saytwist ]] || fail
[[ "$(grep -Fxc "Environment=EXPECTED_RELEASE=$OLD" "$BASE/$SVC")" == 1 ]] || fail
[[ "$(grep -Fxc "Environment=GROWTH_PRIVATE_REPORT_APPROVAL=SAYTWIST_PRIVATE_DAILY_REPORT:$OLD" "$BASE/$SVC")" == 1 ]] || fail
[[ "$(grep -Fxc 'Environment=GROWTH_PRIVATE_REPORT_LAUNCH=true' "$BASE/$SVC")" == 1 ]] || fail
[[ "$(grep -Fxc "EnvironmentFile=$ENV" "$BASE/$SVC")" == 1 ]] || fail
[[ "$(grep -Fxc 'OnCalendar=*-*-* 05:05:00 UTC' "$BASE/$TIMER")" == 1 ]] || fail
[[ "$(grep -Fxc 'Persistent=false' "$BASE/$TIMER")" == 1 ]] || fail

for name in saytwist-growth-lease-watchdog saytwist-growth-daily-observe saytwist-growth-autonomous-cycle saytwist-growth-approved-publisher saytwist-growth-daily-fresh; do
  systemctl is-active --quiet "$name.timer" || fail
  systemctl is-enabled --quiet "$name.timer" || fail
done
[[ "$(systemctl show -P Result saytwist-growth-lease-watchdog.service)" == success ]] || fail
systemctl show -P Environment saytwist-growth-lease-watchdog.service |
  grep -Fq "WATCHDOG_EXPECTED_RELEASE_SHA=$NEW" || fail
for svc in saytwist-growth-daily-observe saytwist-growth-autonomous-cycle saytwist-growth-approved-publisher saytwist-growth-daily-fresh; do
  systemctl show -P Environment "$svc.service" | grep -Fq "EXPECTED_RELEASE=$NEW" || fail
done

TMP=$(mktemp "$BASE/.growth-private-report-rotation.XXXXXXXX")
trap 'rm -f "$TMP"' EXIT
sed -e "s/^Environment=EXPECTED_RELEASE=$OLD$/Environment=EXPECTED_RELEASE=$NEW/" \
  -e "s/^Environment=GROWTH_PRIVATE_REPORT_APPROVAL=SAYTWIST_PRIVATE_DAILY_REPORT:$OLD$/Environment=GROWTH_PRIVATE_REPORT_APPROVAL=SAYTWIST_PRIVATE_DAILY_REPORT:$NEW/" \
  "$BASE/$SVC" > "$TMP"
chown root:root "$TMP"
chmod 0644 "$TMP"
mv "$TMP" "$BASE/$SVC"
systemctl daemon-reload
systemd-analyze verify "$BASE/$SVC" "$BASE/$TIMER" || fail
[[ "$(grep -Fxc "Environment=EXPECTED_RELEASE=$NEW" "$BASE/$SVC")" == 1 ]] || fail
[[ "$(grep -Fxc "Environment=GROWTH_PRIVATE_REPORT_APPROVAL=SAYTWIST_PRIVATE_DAILY_REPORT:$NEW" "$BASE/$SVC")" == 1 ]] || fail
systemctl show -P Environment "$SVC" | grep -Fq "EXPECTED_RELEASE=$NEW" || fail
[[ "$(systemctl is-enabled "$TIMER" 2>/dev/null || true)" == disabled ]] || fail
! systemctl is-active --quiet "$TIMER" || fail
echo "PRIVATE_REPORT_ROTATION=READY_DISABLED"
echo "PRIVATE_REPORT_RELEASE=$NEW"
echo "PRIVATE_REPORT_TIMER=INACTIVE"
