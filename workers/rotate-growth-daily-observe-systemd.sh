#!/usr/bin/env bash
set -Eeuo pipefail
# Phase 14H: rotate ONLY already installed, disabled daily OBSERVE units.
# Never starts timer or worker; a separate owner approval is required.
fail() { printf 'DAILY_OBSERVE_ROTATION=BLOCKED\n' >&2; exit 1; }
[[ "$(id -u)" == "0" && "$#" == "2" ]] || fail
OLD="$1"
NEW="$2"
[[ "$OLD" =~ ^[a-f0-9]{40}$ && "$NEW" =~ ^[a-f0-9]{40}$ && "$OLD" != "$NEW" ]] || fail
APP="/home/saytwist/htdocs/saytwist.com"
SERVICE="saytwist-growth-daily-observe.service"
TIMER="saytwist-growth-daily-observe.timer"
UNIT_DIR="/etc/systemd/system"
SP="$UNIT_DIR/$SERVICE"
TP="$UNIT_DIR/$TIMER"
WATCHDOG="saytwist-growth-lease-watchdog.service"
[[ "$(cat "$APP/.deployed-release")" == "$NEW" ]] || fail
systemctl is-active --quiet saytwist-growth-lease-watchdog.timer || fail
[[ "$(systemctl show -P Result "$WATCHDOG")" == "success" ]] || fail
systemctl show -P Environment "$WATCHDOG" | grep -Fq "WATCHDOG_EXPECTED_RELEASE_SHA=$NEW" || fail

# Only modify root-owned units, and only when disabled/inactive.
for f in "$SP" "$TP"; do
  [[ -f "$f" && ! -L "$f" ]] || fail
  [[ "$(stat -c '%u:%g:%a' "$f")" == "0:0:644" ]] || fail
done
[[ "$(systemctl is-enabled "$TIMER" 2>/dev/null || true)" != "enabled" ]] || fail
[[ "$(systemctl is-active "$TIMER" 2>/dev/null || true)" != "active" ]] || fail
[[ "$(systemctl is-active "$SERVICE" 2>/dev/null || true)" != "active" ]] || fail
[[ "$(grep -Fxc "Environment=EXPECTED_RELEASE=$OLD" "$SP")" == "1" ]] || fail
[[ "$(grep -Fxc 'Environment=GROWTH_DAILY_OBSERVE_MODE=SCHEDULED' "$SP")" == "1" ]] || fail
[[ "$(grep -Fxc 'Persistent=false' "$TP")" == "1" ]] || fail
if grep -Fqx 'OnCalendar=*-*-* 13:00:00 UTC' "$TP"; then
  :
elif grep -Fqx 'OnCalendar=*-*-* 23:50:00 UTC' "$TP"; then
  :
else
  fail
fi

TMP_S="$(mktemp "$UNIT_DIR/.rotate-observe-s.XXXXXX")"
TMP_T="$(mktemp "$UNIT_DIR/.rotate-observe-t.XXXXXX")"
trap 'rm -f "$TMP_S" "$TMP_T"' EXIT
sed "s/Environment=EXPECTED_RELEASE=$OLD/Environment=EXPECTED_RELEASE=$NEW/" "$SP" > "$TMP_S"
sed -e 's/daily OBSERVE 13:00 UTC/daily OBSERVE 23:50 UTC/' \
  -e 's/OnCalendar=\*-\*-\* 13:00:00 UTC/OnCalendar=*-*-* 23:50:00 UTC/' \
  -e 's/AccuracySec=1min/AccuracySec=1s/' "$TP" > "$TMP_T"
chown root:root "$TMP_S" "$TMP_T"
chmod 644 "$TMP_S" "$TMP_T"
mv "$TMP_S" "$SP"
mv "$TMP_T" "$TP"
systemctl daemon-reload
systemd-analyze verify "$SP" "$TP" || fail
[[ "$(grep -Fxc "Environment=EXPECTED_RELEASE=$NEW" "$SP")" == "1" ]] || fail
[[ "$(grep -Fxc 'OnCalendar=*-*-* 23:50:00 UTC' "$TP")" == "1" ]] || fail
[[ "$(systemctl is-enabled "$TIMER" 2>/dev/null || true)" != "enabled" ]] || fail
[[ "$(systemctl is-active "$TIMER" 2>/dev/null || true)" != "active" ]] || fail
printf 'DAILY_OBSERVE_ROTATION=READY_DISABLED\n'
printf 'DAILY_OBSERVE_RELEASE=UPDATED\n'
printf 'DAILY_OBSERVE_TIMER=INACTIVE\n'
