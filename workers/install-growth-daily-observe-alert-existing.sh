#!/usr/bin/env bash
set -Eeuo pipefail
# Install failure alert for an existing disabled, Phase14G daily timer.
# Operator must execute a separately reviewed root-owned 0700 copy.
fail() { echo "DAILY_OBSERVE_ALERT_INSTALL=BLOCKED" >&2; exit 1; }
[[ "$(id -u)" == 0 ]] || fail
[[ -f "$0" && ! -L "$0" && "$(stat -c '%u:%g:%a' "$0")" == "0:0:700" ]] || fail
APP=/home/saytwist/htdocs/saytwist.com
UNITDIR=/etc/systemd/system
SERVICE="$UNITDIR/saytwist-growth-daily-observe.service"
TIMER=saytwist-growth-daily-observe.timer
ALERT="$UNITDIR/saytwist-growth-daily-observe-alert.service"
ENV=/etc/saytwist-growth-watchdog-alert.env
SHA="${1:-}"
[[ "$SHA" =~ ^[a-f0-9]{40}$ ]] || fail
[[ "$(cat "$APP/.deployed-release")" == "$SHA" ]] || fail
[[ -f "$ENV" && ! -L "$ENV" && "$(stat -c '%u:%g:%a' "$ENV")" == "0:0:600" ]] || fail
[[ -f "$SERVICE" && ! -L "$SERVICE" ]] || fail
[[ ! -e "$ALERT" && ! -L "$ALERT" ]] || fail
[[ "$(systemctl is-enabled "$TIMER" 2>/dev/null || true)" != enabled ]] || fail
[[ "$(systemctl is-active "$TIMER" 2>/dev/null || true)" != active ]] || fail
[[ "$(systemctl is-active saytwist-growth-daily-observe.service 2>/dev/null || true)" != active ]] || fail
[[ "$(grep -Fxc 'OnFailure=saytwist-growth-daily-observe-alert.service' "$SERVICE" || true)" == 1 ]] || fail
[[ -f "$APP/workers/growth-daily-observe-alert.cjs" ]] || fail
TMP="$(mktemp "$UNITDIR/.daily-observe-alert-unit.XXXXXX")"
trap 'rm -f "$TMP"' EXIT
cat > "$TMP" <<EOF
[Unit]
Description=SayTwist daily OBSERVE failure alert
Wants=network-online.target
After=network-online.target

[Service]
Type=oneshot
User=saytwist
Group=saytwist
WorkingDirectory=$APP
Environment=NODE_ENV=production
Environment=GROWTH_DAILY_OBSERVE_ALERT_ENABLED=true
EnvironmentFile=$ENV
ExecStart=/home/saytwist/.nvm/versions/node/v24.20.0/bin/node $APP/workers/growth-daily-observe-alert.cjs
StateDirectory=saytwist-growth-daily-observe
StateDirectoryMode=0700
TimeoutStartSec=25
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=false
UMask=0077
EOF
chown root:root "$TMP"
chmod 644 "$TMP"
mv "$TMP" "$ALERT"
systemctl daemon-reload
systemd-analyze verify "$SERVICE" "$ALERT" || fail
[[ "$(systemctl show -P OnFailure saytwist-growth-daily-observe.service)" == saytwist-growth-daily-observe-alert.service ]] || fail
echo "DAILY_OBSERVE_ALERT=INSTALLED"
echo "DAILY_OBSERVE_TIMER=DISABLED"
