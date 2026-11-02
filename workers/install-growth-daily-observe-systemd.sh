#!/usr/bin/env bash
set -Eeuo pipefail

# Installation ONLY; no enable/start. Requires separate explicit owner
# authorization to run this script and a later independent timer approval.
test "$(id -u)" -eq 0
SHA="${1:-}"
APP="/home/saytwist/htdocs/saytwist.com"
UNIT="saytwist-growth-daily-observe.service"
TIMER="saytwist-growth-daily-observe.timer"
ALERT="saytwist-growth-daily-observe-alert.service"
ALERT_ENV="/etc/saytwist-growth-watchdog-alert.env"
UNIT_DIR="/etc/systemd/system"
WATCHDOG="saytwist-growth-lease-watchdog.service"
test "$SHA" != "" && [[ "$SHA" =~ ^[a-f0-9]{40}$ ]]
test "$(cat "$APP/.deployed-release")" = "$SHA"
test -f "$APP/workers/growth-daily-observe-launch.cjs"
test -f "$APP/workers/growth-daily-observe.ts"
test -f "$APP/workers/growth-daily-observe-alert.cjs"
test -f "$ALERT_ENV" && test ! -L "$ALERT_ENV"
test "$(stat -c '%u:%g:%a' "$ALERT_ENV")" = "0:0:600"
systemctl is-active --quiet saytwist-growth-lease-watchdog.timer
test "$(systemctl show -P Result "$WATCHDOG")" = "success"
systemctl show -P Environment "$WATCHDOG" | grep -Fq "WATCHDOG_EXPECTED_RELEASE_SHA=$SHA"

# Refuse to replace an existing service or install over an enabled timer.
test ! -e "$UNIT_DIR/$UNIT" && test ! -L "$UNIT_DIR/$UNIT"
test ! -e "$UNIT_DIR/$TIMER" && test ! -L "$UNIT_DIR/$TIMER"
test ! -e "$UNIT_DIR/$ALERT" && test ! -L "$UNIT_DIR/$ALERT"

tmp_service="$(mktemp "$UNIT_DIR/.daily-observe-service.XXXXXX")"
tmp_timer="$(mktemp "$UNIT_DIR/.daily-observe-timer.XXXXXX")"
tmp_alert="$(mktemp "$UNIT_DIR/.daily-observe-alert.XXXXXX")"
trap 'rm -f "$tmp_service" "$tmp_timer" "$tmp_alert"' EXIT

cat > "$tmp_service" <<EOF
[Unit]
Description=SayTwist one-account daily OBSERVE (owner-gated, disabled by default)
After=network-online.target
Wants=network-online.target
OnFailure=$ALERT
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
Description=SayTwist daily OBSERVE 23:50 UTC (opt-in)

[Timer]
OnCalendar=*-*-* 23:50:00 UTC
Persistent=false
AccuracySec=1s
RandomizedDelaySec=0
Unit=$UNIT

[Install]
WantedBy=timers.target
EOF

cat > "$tmp_alert" <<EOF
[Unit]
Description=SayTwist daily OBSERVE private failure alert
Wants=network-online.target
After=network-online.target

[Service]
Type=oneshot
User=saytwist
Group=saytwist
WorkingDirectory=$APP
Environment=NODE_ENV=production
Environment=GROWTH_DAILY_OBSERVE_ALERT_ENABLED=true
EnvironmentFile=$ALERT_ENV
ExecStart=/home/saytwist/.nvm/versions/node/v24.20.0/bin/node $APP/workers/growth-daily-observe-alert.cjs
StateDirectory=saytwist-growth-daily-observe
StateDirectoryMode=0700
TimeoutStartSec=25s
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=false
UMask=0077
EOF

chown root:root "$tmp_service" "$tmp_timer" "$tmp_alert"
chmod 0644 "$tmp_service" "$tmp_timer" "$tmp_alert"
mv "$tmp_service" "$UNIT_DIR/$UNIT"
mv "$tmp_timer" "$UNIT_DIR/$TIMER"
mv "$tmp_alert" "$UNIT_DIR/$ALERT"
systemctl daemon-reload
systemd-analyze verify "$UNIT_DIR/$UNIT" "$UNIT_DIR/$TIMER" "$UNIT_DIR/$ALERT"
test "$(systemctl is-enabled "$TIMER" 2>/dev/null || true)" != "enabled"
test "$(systemctl is-active "$TIMER" 2>/dev/null || true)" != "active"
printf 'DAILY_OBSERVE_UNITS=INSTALLED_DISABLED\n'
printf 'DAILY_OBSERVE_TIMER=INACTIVE\n'
printf 'DAILY_OBSERVE_GROWTH=OFF\n'
