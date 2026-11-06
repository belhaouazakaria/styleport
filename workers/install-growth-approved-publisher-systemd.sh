#!/usr/bin/env bash
set -Eeuo pipefail
# Install owner-approved, immutable release-pinned publisher units ONLY.
# This script never enables or starts a publisher timer or Growth worker.
fail() { echo "GROWTH_APPROVED_PUBLISHER_INSTALL=BLOCKED" >&2; exit 1; }

[[ "$(id -u)" == 0 && "$#" == 1 ]] || fail
[[ -f "$0" && ! -L "$0" && "$(stat -c '%u:%g:%a' "$0")" == "0:0:700" ]] || fail

SHA="$1"
[[ "$SHA" =~ ^[a-f0-9]{40}$ ]] || fail
APP=/home/saytwist/htdocs/saytwist.com
UNITS=/etc/systemd/system
SERVICE=saytwist-growth-approved-publisher.service
TIMER=saytwist-growth-approved-publisher.timer
ALERT=saytwist-growth-approved-publisher-alert.service
ENV=/etc/saytwist-growth-watchdog-alert.env
WATCHDOG=saytwist-growth-lease-watchdog.service

[[ "$(cat "$APP/.deployed-release")" == "$SHA" ]] || fail
for path in \
  growth-approved-publisher.ts \
  growth-approved-publisher-launch.cjs \
  growth-approved-publisher-alert.cjs; do
  [[ -f "$APP/workers/$path" ]] || fail
done
[[ -f "$APP/node_modules/tsx/dist/cli.mjs" ]] || fail
[[ -f "$ENV" && ! -L "$ENV" &&
   "$(stat -c '%u:%g:%a' "$ENV")" == "0:0:600" ]] || fail

for timer in \
  saytwist-growth-lease-watchdog.timer \
  saytwist-growth-daily-observe.timer \
  saytwist-growth-autonomous-cycle.timer; do
  systemctl is-active --quiet "$timer" || fail
  systemctl is-enabled --quiet "$timer" || fail
done
[[ "$(systemctl show -P Result "$WATCHDOG")" == "success" ]] || fail
[[ "$(systemctl show -P OnFailure "$WATCHDOG")" ==
  "saytwist-growth-lease-watchdog-alert.service" ]] || fail
systemctl show -P Environment "$WATCHDOG" |
  grep -Fq "WATCHDOG_EXPECTED_RELEASE_SHA=$SHA" || fail

for service in \
  saytwist-growth-daily-observe.service \
  saytwist-growth-autonomous-cycle.service; do
  [[ "$(systemctl show -P User "$service")" == "saytwist" ]] || fail
  systemctl show -P Environment "$service" |
    grep -Fq "EXPECTED_RELEASE=$SHA" || fail
done

for unit in "$SERVICE" "$TIMER" "$ALERT"; do
  [[ ! -e "$UNITS/$unit" && ! -L "$UNITS/$unit" ]] || fail
done

TEMP="$(mktemp -d "$UNITS/.approved-publisher-install.XXXXXXXX")"
trap 'rm -rf "$TEMP"' EXIT

cat > "$TEMP/$SERVICE" <<EOF
[Unit]
Description=SayTwist one-approved-Pin scheduled publisher (explicit opt-in)
After=network-online.target
Wants=network-online.target
OnFailure=$ALERT

[Service]
Type=oneshot
User=saytwist
Group=saytwist
WorkingDirectory=$APP
Environment=EXPECTED_RELEASE=$SHA
Environment=GROWTH_APPROVED_PUBLISHER_LAUNCH=true
ExecStart=/home/saytwist/.nvm/versions/node/v24.20.0/bin/node $APP/workers/growth-approved-publisher-launch.cjs
TimeoutStartSec=240
NoNewPrivileges=true
UMask=0077
EOF

cat > "$TEMP/$TIMER" <<EOF
[Unit]
Description=SayTwist approved Pinterest Pin dispatch every five minutes (disabled by default)

[Timer]
OnCalendar=*-*-* *:00/5:00 UTC
Persistent=false
AccuracySec=1s
RandomizedDelaySec=0
Unit=$SERVICE

[Install]
WantedBy=timers.target
EOF

cat > "$TEMP/$ALERT" <<EOF
[Unit]
Description=SayTwist approved Pinterest publisher failure alert
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
User=saytwist
Group=saytwist
WorkingDirectory=$APP
Environment=NODE_ENV=production
Environment=GROWTH_APPROVED_PUBLISHER_ALERT_ENABLED=true
EnvironmentFile=$ENV
ExecStart=/home/saytwist/.nvm/versions/node/v24.20.0/bin/node $APP/workers/growth-approved-publisher-alert.cjs
StateDirectory=saytwist-growth-approved-publisher
StateDirectoryMode=0700
TimeoutStartSec=25
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=false
UMask=0077
EOF

chown root:root "$TEMP/$SERVICE" "$TEMP/$TIMER" "$TEMP/$ALERT"
chmod 0644 "$TEMP/$SERVICE" "$TEMP/$TIMER" "$TEMP/$ALERT"
systemd-analyze verify "$TEMP/$SERVICE" "$TEMP/$TIMER" "$TEMP/$ALERT" || fail
install -o root -g root -m 0644 "$TEMP/$ALERT" "$UNITS/$ALERT"
install -o root -g root -m 0644 "$TEMP/$SERVICE" "$UNITS/$SERVICE"
install -o root -g root -m 0644 "$TEMP/$TIMER" "$UNITS/$TIMER"
systemctl daemon-reload

[[ "$(systemctl is-enabled "$TIMER" 2>/dev/null || true)" != "enabled" ]] || fail
[[ "$(systemctl is-active "$TIMER" 2>/dev/null || true)" != "active" ]] || fail
echo "GROWTH_APPROVED_PUBLISHER_INSTALL=INSTALLED_DISABLED"
echo "GROWTH_APPROVED_PUBLISHER_RELEASE=$SHA"
echo "GROWTH_APPROVED_PUBLISHER_TIMER=INACTIVE"
