#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

APP="/home/saytwist/htdocs/saytwist.com"
NODE="/home/saytwist/.nvm/versions/node/v24.20.0/bin/node"
LAUNCHER="$APP/workers/growth-lease-watchdog-launch.cjs"
SERVICE="saytwist-growth-lease-watchdog.service"
TIMER="saytwist-growth-lease-watchdog.timer"
UNIT_DIR="/etc/systemd/system"

fail() { echo "WATCHDOG_INSTALL=BLOCKED" >&2; exit 1; }
[[ "$(id -un)" == "root" ]] || fail
command -v systemctl >/dev/null || fail
command -v systemd-analyze >/dev/null || fail
[[ -f "$APP/.deployed-release" && -f "$LAUNCHER" && -x "$NODE" ]] || fail
[[ -f "$APP/workers/growth-lease-watchdog.ts" &&
   -f "$APP/node_modules/tsx/dist/cli.mjs" ]] || fail
[[ "$(stat -c %U "$LAUNCHER")" == "saytwist" ]] || fail
[[ "$(stat -c %U "$APP")" == "saytwist" ]] || fail

SHA="$(cat "$APP/.deployed-release")"
[[ "$SHA" =~ ^[a-f0-9]{40}$ ]] || fail
[[ "${HOSTINGER_WATCHDOG_EXPECTED_SHA:-}" == "$SHA" ]] || fail
[[ "${HOSTINGER_WATCHDOG_INSTALL_APPROVAL:-}" == "INSTALL SAYTWIST GROWTH LEASE WATCHDOG $SHA" ]] || fail
[[ ! -e "$UNIT_DIR/$SERVICE" && ! -e "$UNIT_DIR/$TIMER" ]] || fail

STAGING="$(mktemp -d /tmp/saytwist-watchdog-install.XXXXXXXX)"
trap 'rm -rf "$STAGING"' EXIT

cat > "$STAGING/$SERVICE" <<EOF
[Unit]
Description=SayTwist expired Growth activation lease cleanup (no worker jobs)
After=network.target
StartLimitIntervalSec=0

[Service]
Type=oneshot
User=saytwist
Group=saytwist
WorkingDirectory=$APP
Environment=NODE_ENV=production
Environment=GROWTH_LEASE_CLEANUP_ENABLED=true
Environment=WATCHDOG_EXPECTED_RELEASE_SHA=$SHA
ExecStart=$NODE $LAUNCHER
TimeoutStartSec=55s
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=false
ReadWritePaths=/home/saytwist/.pm2
UMask=0077
EOF

cat > "$STAGING/$TIMER" <<EOF
[Unit]
Description=Run SayTwist expired Growth activation lease cleanup every minute

[Timer]
OnCalendar=*-*-* *:*:00
Persistent=true
AccuracySec=1s
Unit=$SERVICE

[Install]
WantedBy=timers.target
EOF

systemd-analyze verify "$STAGING/$SERVICE" "$STAGING/$TIMER" >/dev/null 2>&1 || fail
install -o root -g root -m 0644 "$STAGING/$SERVICE" "$UNIT_DIR/$SERVICE"
install -o root -g root -m 0644 "$STAGING/$TIMER" "$UNIT_DIR/$TIMER"
systemctl daemon-reload
if ! systemctl enable --now "$TIMER" >/dev/null 2>&1 ||
   ! systemctl is-active --quiet "$TIMER" ||
   ! systemctl is-enabled --quiet "$TIMER"; then
  systemctl disable --now "$TIMER" >/dev/null 2>&1 || true
  rm -f "$UNIT_DIR/$SERVICE" "$UNIT_DIR/$TIMER"
  systemctl daemon-reload
  fail
fi
echo "WATCHDOG_INSTALL=TIMER_ACTIVE"
echo "WATCHDOG_INSTALL_RELEASE=$SHA"
echo "WATCHDOG_WORKER_REMAINS_OFF=true"
