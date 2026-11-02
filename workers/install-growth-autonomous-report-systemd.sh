#!/usr/bin/env bash
set -Eeuo pipefail
# Install-only. Explicit owner approval required before enabling schedule.
fail() { echo "GROWTH_REPORT_INSTALL=BLOCKED" >&2; exit 1; }
[[ "$(id -u)" == 0 && "$#" == 1 ]] || fail
[[ -f "$0" && ! -L "$0" && "$(stat -c '%u:%g:%a' "$0")" == "0:0:700" ]] || fail
SHA="$1"
[[ "$SHA" =~ ^[a-f0-9]{40}$ ]] || fail
APP=/home/saytwist/htdocs/saytwist.com
DIR=/etc/systemd/system
SERVICE=saytwist-growth-autonomous-report.service
TIMER=saytwist-growth-autonomous-report.timer
ALERT=saytwist-growth-autonomous-report-alert.service
ENV=/etc/saytwist-growth-watchdog-alert.env
[[ "$(cat "$APP/.deployed-release")" == "$SHA" ]] || fail
systemctl is-active --quiet saytwist-growth-lease-watchdog.timer || fail
systemctl is-active --quiet saytwist-growth-autonomous-cycle.timer || fail
[[ "$(systemctl show -P Result saytwist-growth-lease-watchdog.service)" == success ]] || fail
systemctl show -P Environment saytwist-growth-lease-watchdog.service |
  grep -Fq "WATCHDOG_EXPECTED_RELEASE_SHA=$SHA" || fail
[[ -f "$ENV" && ! -L "$ENV" && "$(stat -c '%u:%g:%a' "$ENV")" == "0:0:600" ]] || fail
[[ -f "$APP/workers/growth-autonomous-report-launch.cjs" ]] || fail
[[ -f "$APP/workers/growth-autonomous-report-alert.cjs" ]] || fail
for name in "$SERVICE" "$TIMER" "$ALERT"; do
  [[ ! -e "$DIR/$name" && ! -L "$DIR/$name" ]] || fail
done
STAGE="$(mktemp -d "$DIR/.growth-report-install.XXXXXXXX")"
trap 'rm -rf "$STAGE"' EXIT
cat > "$STAGE/$SERVICE" <<EOF
[Unit]
Description=SayTwist private daily Growth executive report (opt-in)
Wants=network-online.target
After=network-online.target
OnFailure=$ALERT

[Service]
Type=oneshot
User=saytwist
Group=saytwist
WorkingDirectory=$APP
Environment=EXPECTED_RELEASE=$SHA
Environment=GROWTH_AUTONOMOUS_REPORT_LAUNCH=true
ExecStart=/home/saytwist/.nvm/versions/node/v24.20.0/bin/node $APP/workers/growth-autonomous-report-launch.cjs
TimeoutStartSec=135
NoNewPrivileges=true
UMask=0077
EOF
cat > "$STAGE/$TIMER" <<EOF
[Unit]
Description=SayTwist opt-in private report at 05:30 UTC

[Timer]
OnCalendar=*-*-* 05:30:00 UTC
Persistent=false
AccuracySec=1s
Unit=$SERVICE

[Install]
WantedBy=timers.target
EOF
cat > "$STAGE/$ALERT" <<EOF
[Unit]
Description=SayTwist Growth report delivery failure alert
Wants=network-online.target
After=network-online.target

[Service]
Type=oneshot
User=saytwist
Group=saytwist
WorkingDirectory=$APP
Environment=NODE_ENV=production
Environment=GROWTH_AUTONOMOUS_REPORT_ALERT_ENABLED=true
EnvironmentFile=$ENV
ExecStart=/home/saytwist/.nvm/versions/node/v24.20.0/bin/node $APP/workers/growth-autonomous-report-alert.cjs
StateDirectory=saytwist-growth-report
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
echo "GROWTH_REPORT_INSTALL=INSTALLED_DISABLED"
echo "GROWTH_REPORT_TIMER=INACTIVE"
echo "GROWTH_REPORT_RELEASE=$SHA"
