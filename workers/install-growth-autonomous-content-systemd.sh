#!/usr/bin/env bash
set -Eeuo pipefail
# Opt-in-only systemd installation. Paid AI remains off until separately authorized.
fail() { echo "GROWTH_CONTENT_INSTALL=BLOCKED" >&2; exit 1; }
[[ "$(id -u)" == 0 && "$#" == 1 ]] || fail
[[ -f "$0" && ! -L "$0" && "$(stat -c '%u:%g:%a' "$0")" == "0:0:700" ]] || fail
SHA="$1"
[[ "$SHA" =~ ^[a-f0-9]{40}$ ]] || fail
APP=/home/saytwist/htdocs/saytwist.com
DIR=/etc/systemd/system
SERVICE=saytwist-growth-autonomous-content.service
TIMER=saytwist-growth-autonomous-content.timer
ALERT=saytwist-growth-autonomous-content-alert.service
ENV=/etc/saytwist-growth-watchdog-alert.env
AI_ENV=/etc/saytwist-growth-ai.env
[[ "$(cat "$APP/.deployed-release")" == "$SHA" ]] || fail
systemctl is-active --quiet saytwist-growth-lease-watchdog.timer || fail
systemctl is-active --quiet saytwist-growth-autonomous-cycle.timer || fail
[[ "$(systemctl show -P Result saytwist-growth-lease-watchdog.service)" == success ]] || fail
systemctl show -P Environment saytwist-growth-lease-watchdog.service |
  grep -Fq "WATCHDOG_EXPECTED_RELEASE_SHA=$SHA" || fail
[[ -f "$ENV" && ! -L "$ENV" && "$(stat -c '%u:%g:%a' "$ENV")" == "0:0:600" ]] || fail
[[ -f "$AI_ENV" && ! -L "$AI_ENV" && "$(stat -c '%u:%g:%a' "$AI_ENV")" == "0:0:600" ]] || fail
[[ "$(wc -l < "$AI_ENV")" -eq 2 ]] || fail
grep -Eq '^GROWTH_OPENAI_API_KEY=sk-[A-Za-z0-9_-]{12,}
for name in growth-autonomous-content.ts growth-autonomous-content-launch.cjs growth-autonomous-content-alert.cjs; do
  [[ -f "$APP/workers/$name" ]] || fail
done
for n in "$SERVICE" "$TIMER" "$ALERT"; do
  [[ ! -e "$DIR/$n" && ! -L "$DIR/$n" ]] || fail
done
STAGE="$(mktemp -d "$DIR/.growth-content-install.XXXXXXXX")"
trap 'rm -rf "$STAGE"' EXIT
cat > "$STAGE/$SERVICE" <<EOF
[Unit]
Description=SayTwist bounded autonomous translator/Ideas/creative preparation (opt-in)
Wants=network-online.target
After=network-online.target
OnFailure=$ALERT

[Service]
Type=oneshot
User=saytwist
Group=saytwist
WorkingDirectory=$APP
Environment=EXPECTED_RELEASE=$SHA
Environment=GROWTH_AUTONOMOUS_CONTENT_LAUNCH=true
EnvironmentFile=$AI_ENV
ExecStart=/home/saytwist/.nvm/versions/node/v24.20.0/bin/node $APP/workers/growth-autonomous-content-launch.cjs
TimeoutStartSec=1000
NoNewPrivileges=true
UMask=0077
EOF
cat > "$STAGE/$TIMER" <<EOF
[Unit]
Description=SayTwist autonomous content opportunity preparation 06:30 UTC (opt-in)

[Timer]
OnCalendar=*-*-* 06:30:00 UTC
Persistent=false
AccuracySec=1s
Unit=$SERVICE

[Install]
WantedBy=timers.target
EOF
cat > "$STAGE/$ALERT" <<EOF
[Unit]
Description=SayTwist content preparation and AI budget failure alert
Wants=network-online.target
After=network-online.target

[Service]
Type=oneshot
User=saytwist
Group=saytwist
WorkingDirectory=$APP
Environment=NODE_ENV=production
Environment=GROWTH_AUTONOMOUS_CONTENT_ALERT_ENABLED=true
EnvironmentFile=$ENV
ExecStart=/home/saytwist/.nvm/versions/node/v24.20.0/bin/node $APP/workers/growth-autonomous-content-alert.cjs
StateDirectory=saytwist-growth-content
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
echo "GROWTH_CONTENT_INSTALL=INSTALLED_DISABLED"
echo "GROWTH_CONTENT_TIMER=INACTIVE"
echo "GROWTH_CONTENT_RELEASE=$SHA"
 "$AI_ENV" || fail
grep -Eq '^GROWTH_OPENAI_PROJECT_ID=proj_[A-Za-z0-9_-]{3,128}
for name in growth-autonomous-content.ts growth-autonomous-content-launch.cjs growth-autonomous-content-alert.cjs; do
  [[ -f "$APP/workers/$name" ]] || fail
done
for n in "$SERVICE" "$TIMER" "$ALERT"; do
  [[ ! -e "$DIR/$n" && ! -L "$DIR/$n" ]] || fail
done
STAGE="$(mktemp -d "$DIR/.growth-content-install.XXXXXXXX")"
trap 'rm -rf "$STAGE"' EXIT
cat > "$STAGE/$SERVICE" <<EOF
[Unit]
Description=SayTwist bounded autonomous translator/Ideas/creative preparation (opt-in)
Wants=network-online.target
After=network-online.target
OnFailure=$ALERT

[Service]
Type=oneshot
User=saytwist
Group=saytwist
WorkingDirectory=$APP
Environment=EXPECTED_RELEASE=$SHA
Environment=GROWTH_AUTONOMOUS_CONTENT_LAUNCH=true
ExecStart=/home/saytwist/.nvm/versions/node/v24.20.0/bin/node $APP/workers/growth-autonomous-content-launch.cjs
TimeoutStartSec=1000
NoNewPrivileges=true
UMask=0077
EOF
cat > "$STAGE/$TIMER" <<EOF
[Unit]
Description=SayTwist autonomous content opportunity preparation 06:30 UTC (opt-in)

[Timer]
OnCalendar=*-*-* 06:30:00 UTC
Persistent=false
AccuracySec=1s
Unit=$SERVICE

[Install]
WantedBy=timers.target
EOF
cat > "$STAGE/$ALERT" <<EOF
[Unit]
Description=SayTwist content preparation and AI budget failure alert
Wants=network-online.target
After=network-online.target

[Service]
Type=oneshot
User=saytwist
Group=saytwist
WorkingDirectory=$APP
Environment=NODE_ENV=production
Environment=GROWTH_AUTONOMOUS_CONTENT_ALERT_ENABLED=true
EnvironmentFile=$ENV
ExecStart=/home/saytwist/.nvm/versions/node/v24.20.0/bin/node $APP/workers/growth-autonomous-content-alert.cjs
StateDirectory=saytwist-growth-content
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
echo "GROWTH_CONTENT_INSTALL=INSTALLED_DISABLED"
echo "GROWTH_CONTENT_TIMER=INACTIVE"
echo "GROWTH_CONTENT_RELEASE=$SHA"
 "$AI_ENV" || fail
for name in growth-autonomous-content.ts growth-autonomous-content-launch.cjs growth-autonomous-content-alert.cjs; do
  [[ -f "$APP/workers/$name" ]] || fail
done
for n in "$SERVICE" "$TIMER" "$ALERT"; do
  [[ ! -e "$DIR/$n" && ! -L "$DIR/$n" ]] || fail
done
STAGE="$(mktemp -d "$DIR/.growth-content-install.XXXXXXXX")"
trap 'rm -rf "$STAGE"' EXIT
cat > "$STAGE/$SERVICE" <<EOF
[Unit]
Description=SayTwist bounded autonomous translator/Ideas/creative preparation (opt-in)
Wants=network-online.target
After=network-online.target
OnFailure=$ALERT

[Service]
Type=oneshot
User=saytwist
Group=saytwist
WorkingDirectory=$APP
Environment=EXPECTED_RELEASE=$SHA
Environment=GROWTH_AUTONOMOUS_CONTENT_LAUNCH=true
ExecStart=/home/saytwist/.nvm/versions/node/v24.20.0/bin/node $APP/workers/growth-autonomous-content-launch.cjs
TimeoutStartSec=1000
NoNewPrivileges=true
UMask=0077
EOF
cat > "$STAGE/$TIMER" <<EOF
[Unit]
Description=SayTwist autonomous content opportunity preparation 06:30 UTC (opt-in)

[Timer]
OnCalendar=*-*-* 06:30:00 UTC
Persistent=false
AccuracySec=1s
Unit=$SERVICE

[Install]
WantedBy=timers.target
EOF
cat > "$STAGE/$ALERT" <<EOF
[Unit]
Description=SayTwist content preparation and AI budget failure alert
Wants=network-online.target
After=network-online.target

[Service]
Type=oneshot
User=saytwist
Group=saytwist
WorkingDirectory=$APP
Environment=NODE_ENV=production
Environment=GROWTH_AUTONOMOUS_CONTENT_ALERT_ENABLED=true
EnvironmentFile=$ENV
ExecStart=/home/saytwist/.nvm/versions/node/v24.20.0/bin/node $APP/workers/growth-autonomous-content-alert.cjs
StateDirectory=saytwist-growth-content
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
echo "GROWTH_CONTENT_INSTALL=INSTALLED_DISABLED"
echo "GROWTH_CONTENT_TIMER=INACTIVE"
echo "GROWTH_CONTENT_RELEASE=$SHA"
