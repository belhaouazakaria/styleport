#!/usr/bin/env bash
set -Eeuo pipefail
# Owner-only installation. Never enable a timer, trigger a scan, invoke AI
# or Pinterest, or modify production application/database settings.
fail() { echo 'GROWTH_VIRAL_DISCOVERY_INSTALL=BLOCKED' >&2; exit 1; }
[[ "$(id -u)" == 0 && "$#" == 1 ]] || fail
[[ -f "$0" && ! -L "$0" && "$(stat -c '%u:%g:%a' "$0")" == 0:0:700 ]] || fail
SHA="$1"
[[ "$SHA" =~ ^[a-f0-9]{40}$ ]] || fail

APP=/home/saytwist/htdocs/saytwist.com
DIR=/etc/systemd/system
SERVICE=saytwist-growth-viral-discovery.service
TIMER=saytwist-growth-viral-discovery.timer
ALERT=saytwist-growth-viral-discovery-alert.service
ALERT_ENV=/etc/saytwist-growth-watchdog-alert.env
[[ "$(cat "$APP/.deployed-release")" == "$SHA" ]] || fail
[[ -f "$ALERT_ENV" && ! -L "$ALERT_ENV" &&
  "$(stat -c '%u:%g:%a' "$ALERT_ENV")" == 0:0:600 ]] || fail
for file in growth-viral-discovery.ts growth-viral-discovery-launch.cjs growth-viral-discovery-alert.cjs; do
  [[ -f "$APP/workers/$file" && ! -L "$APP/workers/$file" ]] || fail
done
[[ -f "$APP/node_modules/tsx/dist/cli.mjs" ]] || fail

for name in lease-watchdog daily-observe autonomous-cycle approved-publisher daily-fresh private-report autonomous-content daily-account-analytics auto-translator-publish; do
  PREFIX=saytwist-growth-"$name"
  systemctl is-enabled --quiet "$PREFIX.timer" || fail
  systemctl is-active --quiet "$PREFIX.timer" || fail
  ! systemctl is-active --quiet "$PREFIX.service" || fail
  KEY=EXPECTED_RELEASE
  [[ "$name" == lease-watchdog ]] && KEY=WATCHDOG_EXPECTED_RELEASE_SHA
  systemctl show -P Environment "$PREFIX.service" |
    tr ' ' '\n' | grep -Fqx "$KEY=$SHA" || fail
done
[[ "$(systemctl show -P Result saytwist-growth-lease-watchdog.service)" == success ]] || fail
for UNIT in "$SERVICE" "$TIMER" "$ALERT"; do
  [[ ! -e "$DIR/$UNIT" && ! -L "$DIR/$UNIT" ]] || fail
done

STAGE="$(mktemp -d "$DIR/.growth-viral-discovery-install.XXXXXXXX")"
trap 'rm -rf -- "$STAGE"' EXIT
cat > "$STAGE/$SERVICE" <<EOF
[Unit]
Description=SayTwist bounded daily public-source review scan (owner opt-in)
After=network-online.target
Wants=network-online.target
OnFailure=$ALERT

[Service]
Type=oneshot
User=saytwist
Group=saytwist
WorkingDirectory=$APP
Environment=EXPECTED_RELEASE=$SHA
Environment=GROWTH_VIRAL_DISCOVERY_LAUNCH=true
Environment=GROWTH_VIRAL_DISCOVERY_ENABLED=true
Environment=GROWTH_VIRAL_DISCOVERY_OWNER_APPROVAL=SAYTWIST_VIRAL_DISCOVERY:$SHA
ExecStart=/home/saytwist/.nvm/versions/node/v24.20.0/bin/node $APP/workers/growth-viral-discovery-launch.cjs
TimeoutStartSec=140
NoNewPrivileges=true
UMask=0077
EOF
cat > "$STAGE/$TIMER" <<EOF
[Unit]
Description=SayTwist review-only viral concept discovery 08:15 UTC

[Timer]
OnCalendar=*-*-* 08:15:00 UTC
Persistent=false
RandomizedDelaySec=0
AccuracySec=1s
Unit=$SERVICE

[Install]
WantedBy=timers.target
EOF
cat > "$STAGE/$ALERT" <<EOF
[Unit]
Description=SayTwist isolated public-source discovery failure alert
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
User=saytwist
Group=saytwist
WorkingDirectory=$APP
Environment=NODE_ENV=production
Environment=GROWTH_VIRAL_DISCOVERY_ALERT_ENABLED=true
EnvironmentFile=$ALERT_ENV
ExecStart=/home/saytwist/.nvm/versions/node/v24.20.0/bin/node $APP/workers/growth-viral-discovery-alert.cjs
StateDirectory=saytwist-growth-viral-discovery
StateDirectoryMode=0700
TimeoutStartSec=25
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=false
UMask=0077
EOF

chown root:root "$STAGE/$SERVICE" "$STAGE/$TIMER" "$STAGE/$ALERT"
chmod 0644 "$STAGE/$SERVICE" "$STAGE/$TIMER" "$STAGE/$ALERT"
systemd-analyze verify "$STAGE/$SERVICE" "$STAGE/$TIMER" "$STAGE/$ALERT" || fail
for UNIT in "$ALERT" "$SERVICE" "$TIMER"; do
  install -o root -g root -m 0644 "$STAGE/$UNIT" "$DIR/$UNIT"
done
systemctl daemon-reload
[[ "$(systemctl is-enabled "$TIMER" 2>/dev/null || true)" != enabled ]] || fail
! systemctl is-active --quiet "$TIMER" || fail
! systemctl is-active --quiet "$SERVICE" || fail
echo "GROWTH_VIRAL_DISCOVERY_INSTALL=INSTALLED_DISABLED"
echo "GROWTH_VIRAL_DISCOVERY_TIMER=INACTIVE"
echo "GROWTH_VIRAL_DISCOVERY_RELEASE=$SHA"
