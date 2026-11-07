#!/usr/bin/env bash
set -Eeuo pipefail
# Install ONLY a root-owned, disabled, daily deterministic-creative timer.
# Never enable or start it or a generic Growth worker.
fail() { echo "GROWTH_DAILY_FRESH_INSTALL=BLOCKED" >&2; exit 1; }

[[ "$(id -u)" == 0 && "$#" == 1 ]] || fail
[[ -f "$0" && ! -L "$0" && "$(stat -c '%u:%g:%a' "$0")" == "0:0:700" ]] || fail
SHA="$1"
[[ "$SHA" =~ ^[a-f0-9]{40}$ ]] || fail

APP=/home/saytwist/htdocs/saytwist.com
UNITS=/etc/systemd/system
SERVICE=saytwist-growth-daily-fresh.service
TIMER=saytwist-growth-daily-fresh.timer
ALERT=saytwist-growth-daily-fresh-alert.service
ENV=/etc/saytwist-growth-watchdog-alert.env
WATCHDOG=saytwist-growth-lease-watchdog.service

[[ "$(cat "$APP/.deployed-release")" == "$SHA" ]] || fail
for file in \
  growth-daily-fresh-creatives.ts \
  growth-daily-fresh-launch.cjs \
  growth-daily-fresh-alert.cjs; do
  [[ -f "$APP/workers/$file" ]] || fail
done
[[ -f "$APP/node_modules/tsx/dist/cli.mjs" ]] || fail
[[ -f "$ENV" && ! -L "$ENV" &&
  "$(stat -c '%u:%g:%a' "$ENV")" == "0:0:600" ]] || fail

for timer in \
  saytwist-growth-lease-watchdog.timer \
  saytwist-growth-daily-observe.timer \
  saytwist-growth-autonomous-cycle.timer \
  saytwist-growth-approved-publisher.timer; do
  systemctl is-active --quiet "$timer" || fail
  systemctl is-enabled --quiet "$timer" || fail
done
[[ "$(systemctl show -P Result "$WATCHDOG")" == "success" ]] || fail
systemctl show -P Environment "$WATCHDOG" |
  grep -Fq "WATCHDOG_EXPECTED_RELEASE_SHA=$SHA" || fail
[[ "$(systemctl show -P User saytwist-growth-approved-publisher.service)" == "saytwist" ]] || fail
systemctl show -P Environment saytwist-growth-approved-publisher.service |
  grep -Fq "EXPECTED_RELEASE=$SHA" || fail

for unit in "$SERVICE" "$TIMER" "$ALERT"; do
  [[ ! -e "$UNITS/$unit" && ! -L "$UNITS/$unit" ]] || fail
done

TEMP="$(mktemp -d "$UNITS/.daily-fresh-install.XXXXXXXX")"
trap 'rm -rf "$TEMP"' EXIT

cat > "$TEMP/$SERVICE" <<EOF
[Unit]
Description=SayTwist daily AI Pinterest creative preparation (exact approved release)
After=network-online.target
Wants=network-online.target
OnFailure=$ALERT

[Service]
Type=oneshot
User=saytwist
Group=saytwist
WorkingDirectory=$APP
Environment=EXPECTED_RELEASE=$SHA
Environment=GROWTH_DAILY_FRESH_LAUNCH=true
ExecStart=/home/saytwist/.nvm/versions/node/v24.20.0/bin/node $APP/workers/growth-daily-fresh-launch.cjs
TimeoutStartSec=900
NoNewPrivileges=true
UMask=0077
EOF

cat > "$TEMP/$TIMER" <<EOF
[Unit]
Description=SayTwist AI Pinterest draft generation 07:02 UTC (owner opt-in)

[Timer]
OnCalendar=*-*-* 07:02:00 UTC
Persistent=false
AccuracySec=1s
RandomizedDelaySec=0
Unit=$SERVICE

[Install]
WantedBy=timers.target
EOF

cat > "$TEMP/$ALERT" <<EOF
[Unit]
Description=SayTwist daily fresh creative preparation failure alert
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
User=saytwist
Group=saytwist
WorkingDirectory=$APP
Environment=NODE_ENV=production
Environment=GROWTH_DAILY_FRESH_ALERT_ENABLED=true
EnvironmentFile=$ENV
ExecStart=/home/saytwist/.nvm/versions/node/v24.20.0/bin/node $APP/workers/growth-daily-fresh-alert.cjs
StateDirectory=saytwist-growth-daily-fresh
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
echo "GROWTH_DAILY_FRESH_INSTALL=INSTALLED_DISABLED"
echo "GROWTH_DAILY_FRESH_TIMER=INACTIVE"
echo "GROWTH_DAILY_FRESH_RELEASE=$SHA"
