#!/usr/bin/env bash
set -Eeuo pipefail
# Exact OLD-SHA, 12-timer production hold / restore / recover coordinator.
# Must be copied outside the application tree as root:root mode 0700.
fail() { echo 'GROWTH_TWELVE_RELEASE=BLOCKED' >&2; exit 1; }
[[ "$(id -u)" == 0 && "$#" == 3 ]] || fail
[[ -f "$0" && ! -L "$0" && "$(stat -c '%u:%g:%a' "$0")" == 0:0:700 ]] || fail
MODE="$1"; OLD="$2"; NEW="$3"
[[ "$MODE" == audit || "$MODE" == hold || "$MODE" == restore || "$MODE" == recover ]] || fail
[[ "$OLD" == 924134f2947150d3bf3bba064dd296fc17b2071b ]] || fail
[[ "$NEW" =~ ^[a-f0-9]{40}$ && "$NEW" != "$OLD" ]] || fail
APP=/home/saytwist/htdocs/saytwist.com
BASE=/etc/systemd/system
STATE=/etc/saytwist-growth-twelve-evidence-release-state
SOURCE=/etc/saytwist-growth-viral-source-approval.env
PSQL=/usr/lib/postgresql/18/bin/psql
NAMES='lease-watchdog daily-observe autonomous-cycle approved-publisher daily-fresh private-report autonomous-content daily-account-analytics auto-translator-publish viral-discovery viral-source pin-maintenance'
TIMERS=''
for name in $NAMES; do TIMERS="$TIMERS saytwist-growth-$name.timer"; done
db() { runuser -u postgres -- "$PSQL" -X -qAt -v ON_ERROR_STOP=1 -p 5433 -d saytwist -c "$1"; }
safe_db() {
  local query result
  query="$(cat <<'SQL'
SELECT CASE WHEN
  EXISTS(SELECT 1 FROM "GrowthSettings" WHERE id='global'
    AND NOT "enabled" AND NOT "attributionEnabled"
    AND "workerActivationExpiresAt" IS NULL)
  AND NOT EXISTS(SELECT 1 FROM "GrowthJob" WHERE status IN
    ('PENDING','CLAIMED','RUNNING','FAILED_RETRYABLE'))
  AND EXISTS(SELECT 1 FROM "GrowthViralProgramSettings" WHERE id='global'
    AND mode='ACTIVE' AND "sourceSharePercent"=50 AND "maxPinsPerDay"=5)
THEN 'SAFE' ELSE 'BLOCKED' END;
SQL
)"
  result="$(db "$query")" || fail
  [[ "$result" == SAFE ]] || fail
}
count_migrations() { db 'SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;'; }
calendar() {
  case "$1" in
    lease-watchdog) echo '*-*-* *:*:00' ;;
    daily-observe) echo '*-*-* 13:00:00 UTC' ;;
    autonomous-cycle) echo '*-*-* 04:30:00 UTC' ;;
    approved-publisher) echo '*-*-* *:00/5:00 UTC' ;;
    daily-fresh) echo '*-*-* 07:02:00 UTC' ;;
    private-report) echo '*-*-* 05:05:00 UTC' ;;
    autonomous-content) echo '*-*-* 06:30:00 UTC' ;;
    daily-account-analytics) echo '*-*-* 04:20:00 UTC' ;;
    auto-translator-publish) echo '*-*-* 06:57:00 UTC' ;;
    viral-discovery) echo '*-*-* 08:15:00 UTC' ;;
    viral-source) echo '*-*-* 15..23:17:00 UTC' ;;
    pin-maintenance) echo '*-*-* 10,12,14,16,18,20,22:45:00 UTC' ;;
    *) fail ;;
  esac
}
check_source() {
  local sha="$1"
  [[ -f "$SOURCE" && ! -L "$SOURCE" && "$(stat -c '%u:%g:%a' "$SOURCE")" == 0:0:600 ]] || fail
  [[ "$(wc -l < "$SOURCE")" == 2 ]] || fail
  grep -Fqx 'GROWTH_VIRAL_SOURCE_ENABLED=true' "$SOURCE" || fail
  grep -Fqx "GROWTH_VIRAL_SOURCE_OWNER_APPROVAL=SAYTWIST_VIRAL_SOURCE:$sha" "$SOURCE" || fail
}
check_units() {
  local sha="$1" n unit timer key pers count expected
  for n in $NAMES; do
    unit="saytwist-growth-$n.service"; timer="saytwist-growth-$n.timer"
    for file in "$BASE/$unit" "$BASE/$timer"; do
      [[ -f "$file" && ! -L "$file" && "$(stat -c '%u:%g:%a' "$file")" == 0:0:644 ]] || fail
    done
    [[ -z "$(systemctl show -P DropInPaths "$unit")" ]] || fail
    [[ -z "$(systemctl show -P DropInPaths "$timer")" ]] || fail
    [[ "$(systemctl show -P User "$unit")" == saytwist ]] || fail
    key=EXPECTED_RELEASE; pers=false
    if [[ "$n" == lease-watchdog ]]; then key=WATCHDOG_EXPECTED_RELEASE_SHA; pers=true; fi
    grep -Fqx "Environment=$key=$sha" "$BASE/$unit" || fail
    systemctl show -P Environment "$unit" | tr ' ' '\n' | grep -Fqx "$key=$sha" || fail
    grep -Fqx "OnCalendar=$(calendar "$n")" "$BASE/$timer" || fail
    grep -Fqx "Persistent=$pers" "$BASE/$timer" || fail
    grep -Fqx 'AccuracySec=1s' "$BASE/$timer" || fail
    expected=1
    case "$n" in private-report|viral-discovery|pin-maintenance) expected=2 ;; esac
    count="$(grep -Fc "$sha" "$BASE/$unit" || true)"
    [[ "$count" == "$expected" ]] || fail
    case "$n" in
      private-report) grep -Fqx "Environment=GROWTH_PRIVATE_REPORT_APPROVAL=SAYTWIST_PRIVATE_DAILY_REPORT:$sha" "$BASE/$unit" || fail ;;
      viral-discovery) grep -Fqx "Environment=GROWTH_VIRAL_DISCOVERY_OWNER_APPROVAL=SAYTWIST_VIRAL_DISCOVERY:$sha" "$BASE/$unit" || fail ;;
      pin-maintenance) grep -Fqx "Environment=GROWTH_PIN_MAINTENANCE_OWNER_APPROVAL=SAYTWIST_PIN_MAINTENANCE:$sha" "$BASE/$unit" || fail ;;
    esac
  done
  check_source "$sha"
}
check_timers() {
  local mode="$1" n
  for n in $NAMES; do
    if [[ "$mode" == enabled ]]; then
      [[ "$(systemctl is-enabled "saytwist-growth-$n.timer")" == enabled ]] || fail
      systemctl is-active --quiet "saytwist-growth-$n.timer" || fail
    else
      [[ "$(systemctl is-enabled "saytwist-growth-$n.timer" 2>/dev/null || true)" == disabled ]] || fail
      ! systemctl is-active --quiet "saytwist-growth-$n.timer" || fail
    fi
    ! systemctl is-active --quiet "saytwist-growth-$n.service" || fail
  done
}
write_state() {
  local tmp
  tmp="$(mktemp /etc/.saytwist-growth-twelve-release.XXXXXXXX)" || fail
  printf 'old=%s\nnew=%s\nmigrations=%s\nstatus=%s\n' "$OLD" "$NEW" "$MIGRATIONS" "$1" > "$tmp"
  chown root:root "$tmp"; chmod 0600 "$tmp"
  mv -f "$tmp" "$STATE"
}
check_state() {
  local expected
  [[ -f "$STATE" && ! -L "$STATE" && "$(stat -c '%u:%g:%a' "$STATE")" == 0:0:600 ]] || fail
  expected="$(printf 'old=%s\nnew=%s\nmigrations=%s\nstatus=HELD' "$OLD" "$NEW" "$MIGRATIONS")"
  [[ "$(cat "$STATE")" == "$expected" ]] || fail
}
quiet_window() {
  case "$(date -u +%H)" in
    00|01|02|03|15|16|17|18|19|20|21|22|23) ;;
    *) fail ;;
  esac
}
MIGRATIONS="$(count_migrations)" || fail
[[ "$MIGRATIONS" =~ ^[0-9]+$ && "$MIGRATIONS" -gt 0 ]] || fail
safe_db
if [[ "$MODE" == audit || "$MODE" == hold ]]; then
  [[ "$(cat "$APP/.deployed-release")" == "$OLD" ]] || fail
  check_units "$OLD"; check_timers enabled
  if [[ "$MODE" == audit ]]; then
    echo 'GROWTH_TWELVE_AUDIT=PASSED'
    echo 'GROWTH_TWELVE_TIMERS=TWELVE_ENABLED_ACTIVE'
    exit 0
  fi
  quiet_window
  [[ "$(printenv GROWTH_TWELVE_RELEASE_APPROVAL || true)" == "HOLD:$OLD:$NEW" ]] || fail
  [[ ! -e "$STATE" ]] || fail
  curl -fsS --max-time 10 http://127.0.0.1:3001/api/readyz >/dev/null || fail
  write_state HOLDING
  # Word splitting is intentional: only fixed, hardcoded unit names above.
  systemctl disable --now $TIMERS >/dev/null || fail
  check_timers disabled; safe_db
  write_state HELD
  echo 'GROWTH_TWELVE_HOLD=PASSED'
  exit 0
fi
quiet_window
[[ "$(printenv GROWTH_TWELVE_RELEASE_APPROVAL || true)" == "$(
  if [[ "$MODE" == restore ]]; then printf 'RESTORE:%s:%s' "$OLD" "$NEW";
  else printf 'RECOVER:%s:%s' "$OLD" "$NEW"; fi
)" ]] || fail
check_state
check_units "$OLD"; check_timers disabled
if [[ "$MODE" == recover ]]; then
  [[ "$(cat "$APP/.deployed-release")" == "$OLD" ]] || fail
  systemctl start saytwist-growth-lease-watchdog.service || fail
  [[ "$(systemctl show -P Result saytwist-growth-lease-watchdog.service)" == success ]] || fail
  systemctl enable --now $TIMERS >/dev/null || fail
  check_units "$OLD"
  write_state RECOVERED
  echo 'GROWTH_TWELVE_RECOVER_OLD=PASSED'
  exit 0
fi
[[ "$(cat "$APP/.deployed-release")" == "$NEW" ]] || fail
curl -fsS --max-time 10 http://127.0.0.1:3001/api/readyz >/dev/null || fail
# Any failure below leaves the 12 timers disabled for explicit operator recovery.
echo 'GROWTH_TWELVE_RESTORE=ROTATING'
for n in $NAMES; do
  unit="$BASE/saytwist-growth-$n.service"
  tmp="$(mktemp "$BASE/.saytwist-growth-release.XXXXXXXX")" || fail
  sed "s/$OLD/$NEW/g" "$unit" > "$tmp"
  chown root:root "$tmp"; chmod 0644 "$tmp"
  mv -f "$tmp" "$unit"
done
tmp="$(mktemp /etc/.saytwist-viral-source-approval.XXXXXXXX)" || fail
printf 'GROWTH_VIRAL_SOURCE_ENABLED=true\nGROWTH_VIRAL_SOURCE_OWNER_APPROVAL=SAYTWIST_VIRAL_SOURCE:%s\n' "$NEW" > "$tmp"
chown root:root "$tmp"; chmod 0600 "$tmp"
mv -f "$tmp" "$SOURCE"
systemctl daemon-reload || fail
check_units "$NEW"; check_timers disabled; safe_db
systemctl start saytwist-growth-lease-watchdog.service || fail
[[ "$(systemctl show -P Result saytwist-growth-lease-watchdog.service)" == success ]] || fail
systemctl enable --now $TIMERS >/dev/null || fail
for n in $NAMES; do
  [[ "$(systemctl is-enabled "saytwist-growth-$n.timer")" == enabled ]] || fail
  systemctl is-active --quiet "saytwist-growth-$n.timer" || fail
done
check_units "$NEW"; safe_db
write_state RESTORED
echo 'GROWTH_TWELVE_RESTORE=PASSED'
echo 'GROWTH_TWELVE_TIMERS=TWELVE_ENABLED_ACTIVE'
echo 'GROWTH_TWELVE_DB=SAFE_OFF_EMPTY_QUEUE'
echo "GROWTH_TWELVE_RELEASE_SHA=$NEW"
