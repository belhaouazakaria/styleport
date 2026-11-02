#!/usr/bin/env bash
set -Eeuo pipefail
# Installs disabled-only approved Pin timer. Never authorizes Pin selection.
fail() { echo "APPROVED_PIN_INSTALL=BLOCKED" >&2; exit 1; }
[[ "$(id -u)" == 0 && "$#" == 1 ]] || fail
[[ -f "$0" && ! -L "$0" && "$(stat -c '%u:%g:%a' "$0")" == "0:0:700" ]] || fail
SHA="$1"
[[ "$SHA" =~ ^[a-f0-9]{40}$ ]] || fail
APP=/home/saytwist/htdocs/saytwist.com
DIR=/etc/systemd/system
SERVICE=saytwist-growth-approved-pin.service
TIMER=saytwist-growth-approved-pin.timer
ALERT=saytwist-growth-approved-pin-alert.service
ENV=/etc/saytwist-growth-watchdog-alert.env
[[ "$(cat "$APP/.deployed-release")" == "$SHA" ]] || fail
systemctl is-active --quiet saytwist-growth-lease-watchdog.timer || fail
systemctl is-active --quiet saytwist-growth-daily-observe.timer || fail
[[ "$(systemctl show -P Result saytwist-growth-lease-watchdog.service)" == success ]] || fail
systemctl show -P Environment saytwist-growth-lease-watchdog.service |
  grep -Fq "WATCHDOG_EXPECTED_RELEASE_SHA=$SHA" || fail
[[ -f "$ENV" && ! -L "$ENV" && "$(stat -c '%u:%g:%a' "$ENV")" == "0:0:600" ]] || fail
for n in "$SERVICE" "$TIMER" "$ALERT"; do
  [[ ! -e "$DIR/$n" && ! -L "$DIR/$n" ]] || fail
done
for name in growth-approved-pin-tick.ts growth-approved-pin-launch.cjs growth-approved-pin-alert.cjs; do
  [[ -f "$APP/workers/$name" ]] || fail
done
STAGE="$(mktemp -d "$DIR/.growth-pin-install.XXXXXXXX")"
trap 'rm -rf "$STAGE"' EXIT
cat > "$STAGE/$SERVICE" <<EOF
[Unit]
Description=SayTwist one individually approved Pinterest publication (opt-in)
Wants=network-online.target
After=network-online.target
OnFailure=$ALERT

[Service]
Type=oneshot
User=saytwist
Group=saytwist
WorkingDirectory=$APP
Environment=EXPECTED_RELEASE=$SHA
Environment=GROWTH_APPROVED_PUBLISH_LAUNCH=true
ExecStart=/home/saytwist/.nvm/versions/node/v24.20.0/bin/node $APP/workers/growth-approved-pin-launch.cjs
TimeoutStartSec=145
NoNewPrivileges=true
UMask=0077
EOF
cat > "$STAGE/$TIMER" <<EOF
[Unit]
Description=SayTwist approved Pin scheduling check every 15 minutes (opt-in)

[Timer]
OnCalendar=*-*-* *:00,15,30,45:00 UTC
Persistent=false
AccuracySec=1s
RandomizedDelaySec=0
Unit=$SERVICE

[Install]
WantedBy=timers.target
EOF
cat > "$STAGE/$ALERT" <<EOF
[Unit]
Description=SayTwist approved Pinterest publish failure alert
Wants=network-online.target
After=network-online.target

[Service]
Type=oneshot
User=saytwist
Group=saytwist
WorkingDirectory=$APP
Environment=NODE_ENV=production
Environment=GROWTH_APPROVED_PUBLISH_ALERT_ENABLED=true
EnvironmentFile=$ENV
ExecStart=/home/saytwist/.nvm/versions/node/v24.20.0/bin/node $APP/workers/growth-approved-pin-alert.cjs
StateDirectory=saytwist-growth-approved-pin
StateDirectoryMode=0700
TimeoutStartSec=25
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=false
UMask=0077
EOF
chown root:root "$STAGE/$SERVICE" "$STAGE/$TIMER" "$STAGE/$ALERT"
chmod 644 "$STAGE/$SERVICE" "$STAGE/$TIMER" "$STAGE/$ALERT"
systemd-analyze verify "$STAGE/$SERVICE" "$STAGE/$TIMER" "$STAGE/$ALERT" || fail
install -o root -g root -m 644 "$STAGE/$ALERT" "$DIR/$ALERT"
install -o root -g root -m 644 "$STAGE/$SERVICE" "$DIR/$SERVICE"
install -o root -g root -m 644 "$STAGE/$TIMER" "$DIR/$TIMER"
systemctl daemon-reload
[[ "$(systemctl is-enabled "$TIMER" 2>/dev/null || true)" != enabled ]] || fail
[[ "$(systemctl is-active "$TIMER" 2>/dev/null || true)" != active ]] || fail
echo "APPROVED_PIN_INSTALL=INSTALLED_DISABLED"
echo "APPROVED_PIN_TIMER=INACTIVE"
echo "APPROVED_PIN_RELEASE=$SHA"
