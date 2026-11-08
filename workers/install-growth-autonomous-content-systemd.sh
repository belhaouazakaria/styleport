#!/usr/bin/env bash
set -Eeuo pipefail
# Installs one disabled-only content preparation schedule. Never calls AI,
# enables the timer, or modifies production application/database settings.
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
ALERT_ENV=/etc/saytwist-growth-watchdog-alert.env
AI_ENV=/etc/saytwist-growth-ai.env

[[ "$(cat "$APP/.deployed-release")" == "$SHA" ]] || fail
[[ -f "$ALERT_ENV" && ! -L "$ALERT_ENV" && "$(stat -c '%u:%g:%a' "$ALERT_ENV")" == "0:0:600" ]] || fail
[[ -f "$AI_ENV" && ! -L "$AI_ENV" && "$(stat -c '%u:%g:%a' "$AI_ENV")" == "0:0:600" ]] || fail
[[ "$(wc -l < "$AI_ENV")" -eq 2 ]] || fail
grep -Eq '^GROWTH_OPENAI_API_KEY=sk-[A-Za-z0-9_-]{12,}$' "$AI_ENV" || fail
grep -Eq '^GROWTH_OPENAI_PROJECT_ID=proj_[A-Za-z0-9_-]{3,128}$' "$AI_ENV" || fail

for name in \
  saytwist-growth-lease-watchdog \
  saytwist-growth-daily-observe \
  saytwist-growth-autonomous-cycle \
  saytwist-growth-approved-publisher \
  saytwist-growth-daily-fresh \
  saytwist-growth-private-report; do
  systemctl is-active --quiet "$name.timer" || fail
  systemctl is-enabled --quiet "$name.timer" || fail
done
[[ "$(systemctl show -P Result saytwist-growth-lease-watchdog.service)" == success ]] || fail
systemctl show -P Environment saytwist-growth-lease-watchdog.service |
  grep -Fq "WATCHDOG_EXPECTED_RELEASE_SHA=$SHA" || fail
for name in \
  saytwist-growth-daily-observe \
  saytwist-growth-autonomous-cycle \
  saytwist-growth-approved-publisher \
  saytwist-growth-daily-fresh \
  saytwist-growth-private-report; do
  systemctl show -P Environment "$name.service" |
    grep -Fq "EXPECTED_RELEASE=$SHA" || fail
done
for name in \
  growth-autonomous-content.ts \
  growth-autonomous-content-launch.cjs \
  growth-autonomous-content-alert.cjs; do
  [[ -f "$APP/workers/$name" && ! -L "$APP/workers/$name" ]] || fail
done
for name in "$SERVICE" "$TIMER" "$ALERT"; do
  [[ ! -e "$DIR/$name" && ! -L "$DIR/$name" ]] || fail
done

STAGE="$(mktemp -d "$DIR/.growth-content-install.XXXXXXXX")"
trap 'rm -rf -- "$STAGE"' EXIT
cat > "$STAGE/$SERVICE" <<EOF
[Unit]
Description=SayTwist bounded autonomous Translator and Idea preparation (owner opt-in)
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
Description=SayTwist daily autonomous content preparation at 06:30 UTC (owner opt-in)

[Timer]
OnCalendar=*-*-* 06:30:00 UTC
Persistent=false
AccuracySec=1s
RandomizedDelaySec=0
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
EnvironmentFile=$ALERT_ENV
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
chmod 0644 "$STAGE/$SERVICE" "$STAGE/$TIMER" "$STAGE/$ALERT"
systemd-analyze verify "$STAGE/$SERVICE" "$STAGE/$TIMER" "$STAGE/$ALERT" || fail
for name in "$ALERT" "$SERVICE" "$TIMER"; do
  install -o root -g root -m 0644 "$STAGE/$name" "$DIR/$name"
done
systemctl daemon-reload
[[ "$(systemctl is-enabled "$TIMER" 2>/dev/null || true)" != enabled ]] || fail
! systemctl is-active --quiet "$TIMER" || fail
! systemctl is-active --quiet "$SERVICE" || fail
echo "GROWTH_CONTENT_INSTALL=INSTALLED_DISABLED"
echo "GROWTH_CONTENT_TIMER=INACTIVE"
echo "GROWTH_CONTENT_RELEASE=$SHA"
