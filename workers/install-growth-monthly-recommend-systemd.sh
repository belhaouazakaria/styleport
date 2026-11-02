#!/usr/bin/env bash
set -Eeuo pipefail
# Disabled-only installation. A separate explicit owner activation is required.
fail() { echo "MONTHLY_RECOMMEND_INSTALL=BLOCKED" >&2; exit 1; }
[[ "$(id -u)" == 0 && "$#" == 1 ]] || fail
[[ -f "$0" && ! -L "$0" && "$(stat -c '%u:%g:%a' "$0")" == "0:0:700" ]] || fail
SHA="$1"
[[ "$SHA" =~ ^[a-f0-9]{40}$ ]] || fail
APP=/home/saytwist/htdocs/saytwist.com
BASE=/etc/systemd/system
SVC=saytwist-growth-monthly-recommend.service
TMR=saytwist-growth-monthly-recommend.timer
WATCHDOG=saytwist-growth-lease-watchdog.service
[[ "$(cat "$APP/.deployed-release")" == "$SHA" ]] || fail
[[ -f "$APP/workers/growth-recommend-monthly-launch.cjs" &&
   -f "$APP/workers/growth-recommend-monthly.ts" ]] || fail
systemctl is-active --quiet saytwist-growth-lease-watchdog.timer || fail
[[ "$(systemctl show -P Result "$WATCHDOG")" == success ]] || fail
systemctl show -P Environment "$WATCHDOG" | grep -Fq "WATCHDOG_EXPECTED_RELEASE_SHA=$SHA" || fail
[[ ! -e "$BASE/$SVC" && ! -L "$BASE/$SVC" ]] || fail
[[ ! -e "$BASE/$TMR" && ! -L "$BASE/$TMR" ]] || fail
TEMP_S="$(mktemp "$BASE/.monthly-recommend-service.XXXXXX")"
TEMP_T="$(mktemp "$BASE/.monthly-recommend-timer.XXXXXX")"
trap 'rm -f "$TEMP_S" "$TEMP_T"' EXIT
cat > "$TEMP_S" <<EOF
[Unit]
Description=SayTwist bounded monthly account strategy recommendation
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
User=saytwist
Group=saytwist
WorkingDirectory=$APP
Environment=EXPECTED_RELEASE=$SHA
Environment=GROWTH_MONTHLY_RECOMMEND_LAUNCH=true
ExecStart=/home/saytwist/.nvm/versions/node/v24.20.0/bin/node $APP/workers/growth-recommend-monthly-launch.cjs
TimeoutStartSec=100
NoNewPrivileges=true
UMask=0077
EOF
cat > "$TEMP_T" <<EOF
[Unit]
Description=SayTwist monthly RECOMMEND first day 15:00 UTC (opt-in)

[Timer]
OnCalendar=*-*-01 15:00:00 UTC
Persistent=false
AccuracySec=1s
Unit=$SVC

[Install]
WantedBy=timers.target
EOF
chown root:root "$TEMP_S" "$TEMP_T"
chmod 644 "$TEMP_S" "$TEMP_T"
mv "$TEMP_S" "$BASE/$SVC"
mv "$TEMP_T" "$BASE/$TMR"
systemctl daemon-reload
systemd-analyze verify "$BASE/$SVC" "$BASE/$TMR" || fail
[[ "$(systemctl is-active "$TMR" 2>/dev/null || true)" != active ]] || fail
[[ "$(systemctl is-enabled "$TMR" 2>/dev/null || true)" != enabled ]] || fail
echo MONTHLY_RECOMMEND_UNITS=INSTALLED_DISABLED
echo MONTHLY_RECOMMEND_TIMER=INACTIVE
