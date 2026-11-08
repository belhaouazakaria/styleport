#!/usr/bin/env bash
set -Eeuo pipefail
# Install only. No provider requests, timer activation or production migrations.
fail() { echo "GROWTH_MARKET_RESEARCH_INSTALL=BLOCKED" >&2; exit 1; }
[[ "$(id -u)" == 0 && "$#" == 1 ]] || fail
[[ -f "$0" && ! -L "$0" && "$(stat -c '%u:%g:%a' "$0")" == "0:0:700" ]] || fail
SHA="$1"
[[ "$SHA" =~ ^[a-f0-9]{40}$ ]] || fail

APP=/home/saytwist/htdocs/saytwist.com
UNITS=/etc/systemd/system
SERVICE=saytwist-growth-market-research.service
TIMER=saytwist-growth-market-research.timer
ALERT=saytwist-growth-market-research-alert.service
ALERT_ENV=/etc/saytwist-growth-watchdog-alert.env
WATCHDOG=saytwist-growth-lease-watchdog.service

[[ "$(cat "$APP/.deployed-release")" == "$SHA" ]] || fail
for file in growth-market-research.ts growth-market-research-launch.cjs growth-market-research-alert.cjs; do
  [[ -f "$APP/workers/$file" && ! -L "$APP/workers/$file" ]] || fail
done
[[ -f "$ALERT_ENV" && ! -L "$ALERT_ENV" && "$(stat -c '%u:%g:%a' "$ALERT_ENV")" == "0:0:600" ]] || fail
for name in saytwist-growth-lease-watchdog saytwist-growth-daily-observe saytwist-growth-autonomous-cycle saytwist-growth-approved-publisher saytwist-growth-daily-fresh saytwist-growth-private-report; do
  systemctl is-active --quiet "$name.timer" || fail
  systemctl is-enabled --quiet "$name.timer" || fail
done
[[ "$(systemctl show -P Result "$WATCHDOG")" == "success" ]] || fail
systemctl show -P Environment "$WATCHDOG" | grep -Fq "WATCHDOG_EXPECTED_RELEASE_SHA=$SHA" || fail
for name in saytwist-growth-daily-observe saytwist-growth-autonomous-cycle saytwist-growth-approved-publisher saytwist-growth-daily-fresh saytwist-growth-private-report; do
  systemctl show -P Environment "$name.service" | grep -Fq "EXPECTED_RELEASE=$SHA" || fail
done
for unit in "$SERVICE" "$TIMER" "$ALERT"; do
  [[ ! -e "$UNITS/$unit" && ! -L "$UNITS/$unit" ]] || fail
done

TMP=$(mktemp -d "$UNITS/.market-research-install.XXXXXXXX")
trap 'rm -rf "$TMP"' EXIT
cat > "$TMP/$SERVICE" <<EOF
[Unit]
Description=SayTwist official Pinterest Trends refresh (owner opt-in)
After=network-online.target
Wants=network-online.target
OnFailure=$ALERT

[Service]
Type=oneshot
User=saytwist
Group=saytwist
WorkingDirectory=$APP
Environment=EXPECTED_RELEASE=$SHA
Environment=GROWTH_MARKET_RESEARCH_LAUNCH=true
# Operator must separately provision a root-only approval file with exactly
# the reviewed SHA, authorized API access and explicit enablement flags.
EnvironmentFile=-/etc/saytwist-growth-market-research-approval.env
ExecStart=/home/saytwist/.nvm/versions/node/v24.20.0/bin/node $APP/workers/growth-market-research-launch.cjs
TimeoutStartSec=95
NoNewPrivileges=true
UMask=0077
EOF
cat > "$TMP/$TIMER" <<EOF
[Unit]
Description=SayTwist proactive Pinterest market research refresh 05:10 UTC (owner opt-in)

[Timer]
OnCalendar=*-*-* 05:10:00 UTC
Persistent=false
AccuracySec=1s
RandomizedDelaySec=0
Unit=$SERVICE

[Install]
WantedBy=timers.target
EOF
cat > "$TMP/$ALERT" <<EOF
[Unit]
Description=SayTwist proactive Pinterest market research failure alert
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
User=saytwist
Group=saytwist
WorkingDirectory=$APP
Environment=NODE_ENV=production
Environment=GROWTH_MARKET_RESEARCH_ALERT_ENABLED=true
EnvironmentFile=$ALERT_ENV
ExecStart=/home/saytwist/.nvm/versions/node/v24.20.0/bin/node $APP/workers/growth-market-research-alert.cjs
StateDirectory=saytwist-growth-market-research
StateDirectoryMode=0700
TimeoutStartSec=25
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=false
UMask=0077
EOF

chown root:root "$TMP/$SERVICE" "$TMP/$TIMER" "$TMP/$ALERT"
chmod 0644 "$TMP/$SERVICE" "$TMP/$TIMER" "$TMP/$ALERT"
systemd-analyze verify "$TMP/$SERVICE" "$TMP/$TIMER" "$TMP/$ALERT" || fail
for unit in "$ALERT" "$SERVICE" "$TIMER"; do
  install -o root -g root -m 0644 "$TMP/$unit" "$UNITS/$unit"
done
systemctl daemon-reload
[[ "$(systemctl is-enabled "$TIMER" 2>/dev/null || true)" != enabled ]] || fail
! systemctl is-active --quiet "$TIMER" || fail
echo "GROWTH_MARKET_RESEARCH_INSTALL=INSTALLED_DISABLED"
echo "GROWTH_MARKET_RESEARCH_TIMER=INACTIVE"
echo "GROWTH_MARKET_RESEARCH_RELEASE=$SHA"
