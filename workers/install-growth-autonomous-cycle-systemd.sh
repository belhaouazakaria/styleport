#!/usr/bin/env bash
set -Eeuo pipefail
# One-time installation only. Timer remains disabled until a separate approval.
fail() { echo "GROWTH_CYCLE_INSTALL=BLOCKED" >&2; exit 1; }
[[ "$(id -u)" == 0 && "$#" == 1 ]] || fail
[[ -f "$0" && ! -L "$0" && "$(stat -c '%u:%g:%a' "$0")" == "0:0:700" ]] || fail
SHA="$1"
[[ "$SHA" =~ ^[a-f0-9]{40}$ ]] || fail
APP="/home/saytwist/htdocs/saytwist.com"
DIR="/etc/systemd/system"
SERVICE="saytwist-growth-autonomous-cycle.service"
TIMER="saytwist-growth-autonomous-cycle.timer"
ALERT="saytwist-growth-autonomous-cycle-alert.service"
ENV="/etc/saytwist-growth-watchdog-alert.env"
WATCHDOG="saytwist-growth-lease-watchdog.service"

[[ "$(cat "$APP/.deployed-release")" == "$SHA" ]] || fail
systemctl is-active --quiet saytwist-growth-lease-watchdog.timer || fail
systemctl is-active --quiet saytwist-growth-daily-observe.timer || fail
[[ "$(systemctl show -P Result "$WATCHDOG")" == success ]] || fail
systemctl show -P Environment "$WATCHDOG" | grep -Fq "WATCHDOG_EXPECTED_RELEASE_SHA=$SHA" || fail
[[ "$(systemctl show -P OnFailure "$WATCHDOG")" == saytwist-growth-lease-watchdog-alert.service ]] || fail
[[ -f "$ENV" && ! -L "$ENV" && "$(stat -c '%u:%g:%a' "$ENV")" == "0:0:600" ]] || fail
for name in "$SERVICE" "$TIMER" "$ALERT"; do
  [[ ! -e "$DIR/$name" && ! -L "$DIR/$name" ]] || fail
done
for path in growth-autonomous-cycle.ts growth-autonomous-cycle-launch.cjs growth-autonomous-cycle-alert.cjs; do
  [[ -f "$APP/workers/$path" ]] || fail
done
[[ -f "$APP/node_modules/tsx/dist/cli.mjs" ]] || fail
TMP="$(mktemp -d "$DIR/.growth-cycle-install.XXXXXXXX")"
trap 'rm -rf "$TMP"' EXIT

cat > "$TMP/$SERVICE" <<EOF
[Unit]
Description=SayTwist scheduled local Growth intelligence (bounded, opt-in)
After=network-online.target
Wants=network-online.target
OnFailure=$ALERT

[Service]
Type=oneshot
User=saytwist
Group=saytwist
WorkingDirectory=$APP
Environment=EXPECTED_RELEASE=$SHA
Environment=GROWTH_AUTONOMOUS_CYCLE_LAUNCH=true
ExecStart=/home/saytwist/.nvm/versions/node/v24.20.0/bin/node $APP/workers/growth-autonomous-cycle-launch.cjs
TimeoutStartSec=450
NoNewPrivileges=true
UMask=0077
EOF

cat > "$TMP/$TIMER" <<EOF
[Unit]
Description=SayTwist scheduled Growth intelligence 04:30 UTC (opt-in)

[Timer]
OnCalendar=*-*-* 04:30:00 UTC
Persistent=false
AccuracySec=1s
RandomizedDelaySec=0
Unit=$SERVICE

[Install]
WantedBy=timers.target
EOF

cat > "$TMP/$ALERT" <<EOF
[Unit]
Description=SayTwist Growth intelligence failure alert
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
User=saytwist
Group=saytwist
WorkingDirectory=$APP
Environment=NODE_ENV=production
Environment=GROWTH_AUTONOMOUS_CYCLE_ALERT_ENABLED=true
EnvironmentFile=$ENV
ExecStart=/home/saytwist/.nvm/versions/node/v24.20.0/bin/node $APP/workers/growth-autonomous-cycle-alert.cjs
StateDirectory=saytwist-growth-cycle
StateDirectoryMode=0700
TimeoutStartSec=25s
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=false
UMask=0077
EOF
chown root:root "$TMP/$SERVICE" "$TMP/$TIMER" "$TMP/$ALERT"
chmod 644 "$TMP/$SERVICE" "$TMP/$TIMER" "$TMP/$ALERT"
systemd-analyze verify "$TMP/$SERVICE" "$TMP/$TIMER" "$TMP/$ALERT" || fail
install -o root -g root -m 644 "$TMP/$ALERT" "$DIR/$ALERT"
install -o root -g root -m 644 "$TMP/$SERVICE" "$DIR/$SERVICE"
install -o root -g root -m 644 "$TMP/$TIMER" "$DIR/$TIMER"
systemctl daemon-reload
[[ "$(systemctl is-enabled "$TIMER" 2>/dev/null || true)" != enabled ]] || fail
[[ "$(systemctl is-active "$TIMER" 2>/dev/null || true)" != active ]] || fail
echo "GROWTH_CYCLE_INSTALL=INSTALLED_DISABLED"
echo "GROWTH_CYCLE_TIMER=INACTIVE"
echo "GROWTH_CYCLE_RELEASE=$SHA"
