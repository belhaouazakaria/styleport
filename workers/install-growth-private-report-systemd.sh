#!/usr/bin/env bash
set -Eeuo pipefail
# Root-reviewed installation only; NEVER starts or enables the private report.
fail() { echo "PRIVATE_REPORT_INSTALL=BLOCKED" >&2; exit 1; }
[[ "$(id -u)" == 0 && "$#" == 1 ]] || fail
[[ -f "$0" && ! -L "$0" && "$(stat -c '%u:%g:%a' "$0")" == "0:0:700" ]] || fail
SHA="$1"
[[ "$SHA" =~ ^[a-f0-9]{40}$ ]] || fail
APP=/home/saytwist/htdocs/saytwist.com
UNITS=/etc/systemd/system
ENV=/etc/saytwist-growth-private-report.env
SVC=saytwist-growth-private-report.service
TMR=saytwist-growth-private-report.timer
[[ "$(cat "$APP/.deployed-release")" == "$SHA" ]] || fail
[[ -f "$APP/workers/growth-private-report-launch.cjs" &&
   -f "$APP/workers/growth-report-runner.ts" ]] || fail
[[ -f "$ENV" && ! -L "$ENV" && "$(stat -c '%u:%g:%a' "$ENV")" == "0:0:600" ]] || fail
[[ "$(wc -l < "$ENV")" == 4 ]] || fail
for key in TELEGRAM_BOT_TOKEN TELEGRAM_REPORT_CHAT_ID TELEGRAM_REPORTS_ENABLED GROWTH_DAILY_REPORT_SCHEDULE_ENABLED; do
  [[ "$(grep -Ec "^$key=" "$ENV")" == 1 ]] || fail
done
grep -Eq '^TELEGRAM_BOT_TOKEN=[1-9][0-9]{5,14}:[A-Za-z0-9_-]{30,}$' "$ENV" || fail
grep -Eq '^TELEGRAM_REPORT_CHAT_ID=[1-9][0-9]{4,15}$' "$ENV" || fail
grep -Fqx 'TELEGRAM_REPORTS_ENABLED=true' "$ENV" || fail
grep -Fqx 'GROWTH_DAILY_REPORT_SCHEDULE_ENABLED=true' "$ENV" || fail
for unit in "$SVC" "$TMR"; do
  [[ ! -e "$UNITS/$unit" && ! -L "$UNITS/$unit" ]] || fail
done
TMP="$(mktemp -d "$UNITS/.private-report.XXXXXXXX")"
trap 'rm -rf "$TMP"' EXIT
cat > "$TMP/$SVC" <<EOF
[Unit]
Description=SayTwist one-recipient immutable daily Growth report
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
User=saytwist
Group=saytwist
WorkingDirectory=$APP
Environment=EXPECTED_RELEASE=$SHA
Environment=GROWTH_PRIVATE_REPORT_LAUNCH=true
Environment=GROWTH_PRIVATE_REPORT_APPROVAL=SAYTWIST_PRIVATE_DAILY_REPORT:$SHA
EnvironmentFile=$ENV
ExecStart=/home/saytwist/.nvm/versions/node/v24.20.0/bin/node $APP/workers/growth-private-report-launch.cjs
TimeoutStartSec=65
NoNewPrivileges=true
UMask=0077
EOF
cat > "$TMP/$TMR" <<EOF
[Unit]
Description=SayTwist private Growth report at 05:05 UTC, separately opt-in
[Timer]
OnCalendar=*-*-* 05:05:00 UTC
Persistent=false
AccuracySec=1s
RandomizedDelaySec=0
Unit=$SVC
[Install]
WantedBy=timers.target
EOF
chown root:root "$TMP/$SVC" "$TMP/$TMR"
chmod 0644 "$TMP/$SVC" "$TMP/$TMR"
systemd-analyze verify "$TMP/$SVC" "$TMP/$TMR" || fail
install -o root -g root -m 0644 "$TMP/$SVC" "$UNITS/$SVC"
install -o root -g root -m 0644 "$TMP/$TMR" "$UNITS/$TMR"
systemctl daemon-reload
[[ "$(systemctl is-enabled "$TMR" 2>/dev/null || true)" != enabled ]] || fail
! systemctl is-active --quiet "$TMR" || fail
echo "PRIVATE_REPORT_INSTALL=INSTALLED_DISABLED"
echo "PRIVATE_REPORT_TIMER=INACTIVE"
