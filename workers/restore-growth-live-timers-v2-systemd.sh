#!/usr/bin/env bash
set -Eeuo pipefail
# Restore exactly SIX previously authorized live Growth schedulers after an
# owner-approved, protected production release. The hold must have disabled
# and stopped all five operational timers and stopped (not disabled) watchdog.
# Never runs paid AI, Telegram send, Pinterest posting or other new workers.
fail() { echo "GROWTH_LIVE_RELEASE_RESTORE=BLOCKED" >&2; exit 1; }
[[ "$(id -u)" == 0 && "$#" == 2 ]] || fail
[[ -f "$0" && ! -L "$0" && "$(stat -c '%u:%g:%a' "$0")" == "0:0:700" ]] || fail
OLD="$1"
NEW="$2"
[[ "$OLD" =~ ^[a-f0-9]{40}$ && "$NEW" =~ ^[a-f0-9]{40}$ && "$OLD" != "$NEW" ]] || fail

APP=/home/saytwist/htdocs/saytwist.com
BASE=/etc/systemd/system
WATCH=saytwist-growth-lease-watchdog
OBS=saytwist-growth-daily-observe
CYCLE=saytwist-growth-autonomous-cycle
PUB=saytwist-growth-approved-publisher
AI=saytwist-growth-daily-fresh
REPORT=saytwist-growth-private-report
stage=PREFLIGHT
started=0
dir=""
on_exit() {
  local status="$?"
  if [[ "$status" != 0 && "$started" == 1 ]]; then
    systemctl disable --now "$PUB.timer" "$CYCLE.timer" "$OBS.timer" "$AI.timer" "$REPORT.timer" >/dev/null 2>&1 || :
    echo "GROWTH_LIVE_RELEASE_RESTORE=PARTIAL_STOPPED" >&2
    echo "GROWTH_LIVE_RELEASE_STAGE=$stage" >&2
  fi
  if [[ -n "$dir" ]]; then rm -rf -- "$dir"; fi
}
trap on_exit EXIT

safe_db() {
  [[ "$(runuser -u postgres -- /usr/lib/postgresql/18/bin/psql \
    -X -qAt -v ON_ERROR_STOP=1 -p 5433 -d saytwist \
    -c "SELECT CASE WHEN COUNT(*)=1 AND bool_and(
      NOT \"enabled\" AND NOT \"attributionEnabled\"
      AND \"workerActivationExpiresAt\" IS NULL)
      THEN 'SAFE_OFF' ELSE 'BLOCKED' END FROM \"GrowthSettings\" WHERE id='global';")" == "SAFE_OFF" ]] || fail
}
pin() {
  local service="$1" variable="$2" sha="$3"
  [[ -f "$BASE/$service.service" && ! -L "$BASE/$service.service" ]] || fail
  [[ "$(stat -c '%u:%g:%a' "$BASE/$service.service")" == "0:0:644" ]] || fail
  [[ "$(grep -Fxc "Environment=$variable=$sha" "$BASE/$service.service")" == 1 ]] || fail
  [[ -z "$(systemctl show -P DropInPaths "$service.service")" ]] || fail
}
disabled() {
  [[ "$(systemctl is-enabled "$1.timer" 2>/dev/null || true)" == disabled ]] || fail
  ! systemctl is-active --quiet "$1.timer" || fail
  ! systemctl is-active --quiet "$1.service" || fail
}
active() {
  systemctl is-enabled --quiet "$1.timer" || fail
  systemctl is-active --quiet "$1.timer" || fail
}

[[ "$(cat "$APP/.deployed-release")" == "$NEW" ]] || fail
curl -fsS --max-time 10 https://saytwist.com/api/readyz >/dev/null || fail
safe_db
# Restrict rotation to a quiet UTC operating window. Never restore a paid AI
# or Telegram timer seconds before its intended scheduled execution.
hour=$(date -u +%H)
[[ "$hour" -ge 15 || "$hour" -lt 4 ]] || fail
for name in "$OBS" "$CYCLE" "$PUB" "$AI" "$REPORT"; do disabled "$name"; done
[[ "$(systemctl is-enabled "$WATCH.timer" 2>/dev/null || true)" == enabled ]] || fail
! systemctl is-active --quiet "$WATCH.timer" || fail
! systemctl is-active --quiet "$WATCH.service" || fail
pin "$WATCH" WATCHDOG_EXPECTED_RELEASE_SHA "$OLD"
for name in "$OBS" "$CYCLE" "$PUB" "$AI" "$REPORT"; do
  pin "$name" EXPECTED_RELEASE "$OLD"
done
[[ "$(grep -Fxc "Environment=GROWTH_PRIVATE_REPORT_APPROVAL=SAYTWIST_PRIVATE_DAILY_REPORT:$OLD" "$BASE/$REPORT.service")" == 1 ]] || fail

# Verify immutable release-specific helper blobs, then execute root-owned 0700
# copies, never the writable application-user originals.
files=(
  "rotate-growth-watchdog-release-systemd.sh:030bade24793e53c6c275e51dd5a979b85858b87"
  "rotate-growth-daily-observe-systemd.sh:889343978f28fd1c6b0a4357de647651b8d9ea09"
  "rotate-growth-autonomous-cycle-systemd.sh:29b411f8ce527841b48fff148cf55cd21ebb250c"
  "rotate-growth-approved-publisher-release-systemd.sh:351ca5e10d3ffa50dbd74e86e6ba5cbc49c4e6ec"
  "rotate-growth-daily-fresh-release-systemd.sh:d9b7f9683a57d8d5cdc171510bea747af2d4af98"
  "rotate-growth-private-report-release-systemd.sh:418d888f5a3a810dcaf5c4df63e7b3e19bbc21a3"
)
dir=$(mktemp -d /root/saytwist-live-restore.XXXXXXXX)
chmod 0700 "$dir"
for entry in "${files[@]}"; do
  name="${entry%%:*}"
  blob="${entry##*:}"
  src="$APP/workers/$name"
  [[ -f "$src" && ! -L "$src" ]] || fail
  [[ "$(git hash-object "$src")" == "$blob" ]] || fail
  install -o root -g root -m 0700 "$src" "$dir/$name"
  [[ "$(git hash-object "$dir/$name")" == "$blob" ]] || fail
  bash -n "$dir/$name" || fail
done

echo "GROWTH_LIVE_RESTORE_PREFLIGHT=PASSED"
started=1
stage=WATCHDOG
"$dir/rotate-growth-watchdog-release-systemd.sh" "$OLD" "$NEW"
active "$WATCH"
pin "$WATCH" WATCHDOG_EXPECTED_RELEASE_SHA "$NEW"
safe_db

stage=OBSERVE
"$dir/rotate-growth-daily-observe-systemd.sh" "$OLD" "$NEW"
pin "$OBS" EXPECTED_RELEASE "$NEW"
disabled "$OBS"

stage=INTELLIGENCE
"$dir/rotate-growth-autonomous-cycle-systemd.sh" "$OLD" "$NEW"
pin "$CYCLE" EXPECTED_RELEASE "$NEW"
disabled "$CYCLE"
safe_db

stage=OBSERVE_INTELLIGENCE_RESTORE
systemctl enable --now "$OBS.timer" "$CYCLE.timer" >/dev/null
active "$OBS"
active "$CYCLE"

stage=APPROVED_PUBLISHER
"$dir/rotate-growth-approved-publisher-release-systemd.sh" "$OLD" "$NEW"
pin "$PUB" EXPECTED_RELEASE "$NEW"
disabled "$PUB"

stage=APPROVED_PUBLISHER_RESTORE
safe_db
systemctl enable --now "$PUB.timer" >/dev/null
active "$PUB"

stage=PAID_AI
"$dir/rotate-growth-daily-fresh-release-systemd.sh" "$OLD" "$NEW"
pin "$AI" EXPECTED_RELEASE "$NEW"
disabled "$AI"

stage=PAID_AI_RESTORE
safe_db
systemctl enable --now "$AI.timer" >/dev/null
active "$AI"
! systemctl is-active --quiet "$AI.service" || fail

stage=PRIVATE_TELEGRAM
"$dir/rotate-growth-private-report-release-systemd.sh" "$OLD" "$NEW"
pin "$REPORT" EXPECTED_RELEASE "$NEW"
[[ "$(grep -Fxc "Environment=GROWTH_PRIVATE_REPORT_APPROVAL=SAYTWIST_PRIVATE_DAILY_REPORT:$NEW" "$BASE/$REPORT.service")" == 1 ]] || fail
disabled "$REPORT"

stage=PRIVATE_TELEGRAM_RESTORE
safe_db
systemctl enable --now "$REPORT.timer" >/dev/null
active "$REPORT"
! systemctl is-active --quiet "$REPORT.service" || fail

stage=POSTCONDITIONS
for name in "$WATCH" "$OBS" "$CYCLE" "$PUB" "$AI" "$REPORT"; do active "$name"; done
safe_db
[[ "$(cat "$APP/.deployed-release")" == "$NEW" ]] || fail
echo "GROWTH_LIVE_RELEASE_RESTORE=PASSED"
echo "GROWTH_LIVE_TIMERS=SIX_ACTIVE"
echo "GROWTH_AI_TIMER=ACTIVE"
echo "GROWTH_PRIVATE_REPORT_TIMER=ACTIVE"
echo "GROWTH_DB=SAFE_OFF"
