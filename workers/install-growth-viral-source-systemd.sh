#!/usr/bin/env bash
set -Eeuo pipefail
# Install ONLY. No activation, network provider request, migrations or Pin writes.
fail() { echo "GROWTH_VIRAL_SOURCE_INSTALL=BLOCKED" >&2; exit 1; }
[[ "$(id -u)" == 0 && "$#" == 1 ]] || fail
[[ -f "$0" && ! -L "$0" && "$(stat -c '%u:%g:%a' "$0")" == "0:0:700" ]] || fail
SHA="$1"
[[ "$SHA" =~ ^[a-f0-9]{40}$ ]] || fail
APP=/home/saytwist/htdocs/saytwist.com
DIR=/etc/systemd/system
SERVICE=saytwist-growth-viral-source.service
TIMER=saytwist-growth-viral-source.timer
ALERT=saytwist-growth-viral-source-alert.service
ALERT_ENV=/etc/saytwist-growth-watchdog-alert.env
APPROVAL_ENV=/etc/saytwist-growth-viral-source-approval.env
[[ "$(cat "$APP/.deployed-release")" == "$SHA" ]] || fail
[[ -f "$ALERT_ENV" && ! -L "$ALERT_ENV" &&
   "$(stat -c '%u:%g:%a' "$ALERT_ENV")" == "0:0:600" ]] || fail
for file in growth-viral-source-publisher.ts growth-viral-source-launch.cjs growth-viral-source-alert.cjs; do
  [[ -f "$APP/workers/$file" && ! -L "$APP/workers/$file" ]] || fail
done
for name in lease-watchdog daily-observe autonomous-cycle approved-publisher daily-fresh private-report autonomous-content daily-account-analytics auto-translator-publish; do
  BASE=saytwist-growth-"$name"
  systemctl is-enabled --quiet "$BASE.timer" || fail
  systemctl is-active --quiet "$BASE.timer" || fail
  [[ "$(systemctl is-active "$BASE.service")" != active ]] || fail
  VARIABLE=EXPECTED_RELEASE
  [[ "$name" == lease-watchdog ]] && VARIABLE=WATCHDOG_EXPECTED_RELEASE_SHA
  systemctl show -P Environment "$BASE.service" |
    grep -Fq "$VARIABLE=$SHA" || fail
done
[[ "$(systemctl show -P Result saytwist-growth-lease-watchdog.service)" == success ]] || fail
for UNIT in "$SERVICE" "$TIMER" "$ALERT"; do
  [[ ! -e "$DIR/$UNIT" && ! -L "$DIR/$UNIT" ]] || fail
done
STAGE="$(mktemp -d "$DIR/.growth-viral-source.XXXXXXXX")"
trap 'rm -rf -- "$STAGE"' EXIT
cat > "$STAGE/$SERVICE" <<EOF
[Unit]
Description=SayTwist bounded source-linked original Pin publication (owner opt-in)
After=network-online.target
Wants=network-online.target
OnFailure=$ALERT

[Service]
Type=oneshot
User=saytwist
Group=saytwist
WorkingDirectory=$APP
Environment=EXPECTED_RELEASE=$SHA
Environment=GROWTH_VIRAL_SOURCE_LAUNCH=true
EnvironmentFile=-$APPROVAL_ENV
ExecStart=/home/saytwist/.nvm/versions/node/v24.20.0/bin/node $APP/workers/growth-viral-source-launch.cjs
TimeoutStartSec=240
NoNewPrivileges=true
UMask=0077
EOF
cat > "$STAGE/$TIMER" <<EOF
[Unit]
Description=SayTwist original source-Pin publisher, approved-only, every hour 15:17-23:17 UTC

[Timer]
OnCalendar=*-*-* 15..23:17:00 UTC
Persistent=false
RandomizedDelaySec=0
AccuracySec=1s
Unit=$SERVICE

[Install]
WantedBy=timers.target
EOF
cat > "$STAGE/$ALERT" <<EOF
[Unit]
Description=SayTwist isolated source-Pin failure alert
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
User=saytwist
Group=saytwist
WorkingDirectory=$APP
Environment=NODE_ENV=production
Environment=GROWTH_VIRAL_SOURCE_ALERT_ENABLED=true
EnvironmentFile=$ALERT_ENV
ExecStart=/home/saytwist/.nvm/versions/node/v24.20.0/bin/node $APP/workers/growth-viral-source-alert.cjs
StateDirectory=saytwist-growth-viral-source
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
echo "GROWTH_VIRAL_SOURCE_INSTALL=INSTALLED_DISABLED"
echo "GROWTH_VIRAL_SOURCE_RELEASE=$SHA"
