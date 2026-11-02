#!/usr/bin/env bash
set -Eeuo pipefail

# Installation ONLY; no enable/start. Requires separate explicit owner
# authorization to run this script and a later independent timer approval.
test "$(id -u)" -eq 0
SHA="${1:-}"
APP="/home/saytwist/htdocs/saytwist.com"
UNIT="saytwist-growth-daily-observe.service"
TIMER="saytwist-growth-daily-observe.timer"
UNIT_DIR="/etc/systemd/system"
WATCHDOG="saytwist-growth-lease-watchdog.service"
test "$SHA" != "" && [[ "$SHA" =~ ^[a-f0-9]{40}$ ]]
test "$(cat "$APP/.deployed-release")" = "$SHA"
test -f "$APP/workers/growth-daily-observe-launch.cjs"
test -f "$APP/workers/growth-daily-observe.ts"
systemctl is-active --quiet saytwist-growth-lease-watchdog.timer
test "$(systemctl show -P Result "$WATCHDOG")" = "success"
systemctl show -P Environment "$WATCHDOG" | grep -Fq "WATCHDOG_EXPECTED_RELEASE_SHA=$SHA"

# Refuse to replace an existing service or install over an enabled timer.
test ! -e "$UNIT_DIR/$UNIT" && test ! -L "$UNIT_DIR/$UNIT"
test ! -e "$UNIT_DIR/$TIMER" && test ! -L "$UNIT_DIR/$TIMER"

tmp_service="$(mktemp "$UNIT_DIR/.daily-observe-service.XXXXXX")"
tmp_timer="$(mktemp "$UNIT_DIR/.daily-observe-timer.XXXXXX")"
trap 'rm -f "$tmp_service" "$tmp_timer"' EXIT

cat > "$tmp_service" <<EOF
[Unit]
Description=SayTwist one-account daily OBSERVE (owner-gated, disabled by default)
After=network-online.target
Wants=network-online.target
ConditionPathExists=$APP/workers/growth-daily-observe-launch.cjs

[Service]
Type=oneshot
User=saytwist
Group=saytwist
WorkingDirectory=$APP
Environment=EXPECTED_RELEASE=$SHA
Environment=GROWTH_DAILY_OBSERVE_LAUNCH=true
Environment=GROWTH_DAILY_OBSERVE_MODE=SCHEDULED
ExecStart=/home/saytwist/.nvm/versions/node/v24.20.0/bin/node $APP/workers/growth-daily-observe-launch.cjs
TimeoutStartSec=100
NoNewPrivileges=true
UMask=0077
EOF

cat > "$tmp_timer" <<EOF
[Unit]
Description=SayTwist daily OBSERVE 13:00 UTC (opt-in)

[Timer]
OnCalendar=*-*-* 13:00:00 UTC
Persistent=false
AccuracySec=1min
RandomizedDelaySec=0
Unit=$UNIT

[Install]
WantedBy=timers.target
EOF

chown root:root "$tmp_service" "$tmp_timer"
chmod 0644 "$tmp_service" "$tmp_timer"
mv "$tmp_service" "$UNIT_DIR/$UNIT"
mv "$tmp_timer" "$UNIT_DIR/$TIMER"
systemctl daemon-reload
systemd-analyze verify "$UNIT_DIR/$UNIT" "$UNIT_DIR/$TIMER"
test "$(systemctl is-enabled "$TIMER" 2>/dev/null || true)" != "enabled"
test "$(systemctl is-active "$TIMER" 2>/dev/null || true)" != "active"
printf 'DAILY_OBSERVE_UNITS=INSTALLED_DISABLED\n'
printf 'DAILY_OBSERVE_TIMER=INACTIVE\n'
printf 'DAILY_OBSERVE_GROWTH=OFF\n'
