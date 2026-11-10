#!/usr/bin/env bash
set -Eeuo pipefail
# Owner-scoped Pinterest board inventory release only: operate on nine previously approved timers.
# NO database migration or new publisher activation. Exact known-old SHA only.
# Copy the exact reviewed blob to a root-owned 0700 file outside application
# directories before executing. This script never installs a new timer.
fail() { echo 'GROWTH_NINE_RELEASE=BLOCKED' >&2; exit 1; }
[[ "$(id -u)" == 0 && "$#" == 3 ]] || fail
[[ -f "$0" && ! -L "$0" && "$(stat -c '%u:%g:%a' "$0")" == 0:0:700 ]] || fail
MODE="$1"; OLD="$2"; NEW="$3"
[[ "$MODE" == audit || "$MODE" == hold || "$MODE" == restore || "$MODE" == recover ]] || fail
[[ "$OLD" =~ ^[a-f0-9]{40}$ && "$NEW" =~ ^[a-f0-9]{40}$ && "$OLD" != "$NEW" ]] || fail
[[ "$OLD" == fd5d138f1e6e399a0c218eb6ffc5eca74df573d2 ]] || fail

APP=/home/saytwist/htdocs/saytwist.com
BASE=/etc/systemd/system
STATE=/etc/saytwist-growth-nine-board-sync-release-state
PSQL=/usr/lib/postgresql/18/bin/psql
NAMES=(
  lease-watchdog daily-observe autonomous-cycle approved-publisher
  daily-fresh private-report autonomous-content daily-account-analytics
  auto-translator-publish
)
CALENDARS=(
  '*-*-* *:*:00'
  '*-*-* 13:00:00 UTC'
  '*-*-* 04:30:00 UTC'
  '*-*-* *:00/5:00 UTC'
  '*-*-* 07:02:00 UTC'
  '*-*-* 05:05:00 UTC'
  '*-*-* 06:30:00 UTC'
  '*-*-* 04:20:00 UTC'
  '*-*-* 06:57:00 UTC'
)
TIMERS=()
OTHERS=()
for n in "${NAMES[@]}"; do
  TIMERS+=("saytwist-growth-$n.timer")
  [[ "$n" == lease-watchdog ]] || OTHERS+=("saytwist-growth-$n.timer")
done
db() {
  runuser -u postgres -- "$PSQL" -X -qAt -v ON_ERROR_STOP=1 -p 5433 -d "$1" -c "$2"
}
safe_db() {
  [[ "$(db saytwist 'SELECT CASE WHEN count(*)=1 AND bool_and(NOT "enabled" AND NOT "attributionEnabled" AND "workerActivationExpiresAt" IS NULL) THEN 1 ELSE 0 END FROM "GrowthSettings" WHERE id='\''global'\'';')" == 1 ]] || fail
  # Preserve the owner's two manually requested Pinterest inventory syncs.
  # No other Growth jobs are allowed. This is NOT permission to execute them.
  # Empty queue also passes if both syncs have already completed independently.
  local queue_sql
  queue_sql="$(cat <<'SQL'
WITH blocking AS (
  SELECT "type"::text AS kind, "status"::text AS state,
         "attemptCount", "maxAttempts", "idempotencyKey", "payload",
         "runAfter", "claimedAt", "leaseUntil", "heartbeatAt",
         "workerId", "completedAt", "lastError"
  FROM "GrowthJob"
  WHERE status IN ('PENDING','CLAIMED','RUNNING','FAILED_RETRYABLE')
)
SELECT CASE WHEN
  count(*) <= 2
  AND count(*) FILTER (
    WHERE state='PENDING'
      AND kind IN ('PINTEREST_ACCOUNT_SYNC','PINTEREST_BOARD_SYNC')
      AND "attemptCount"=0 AND "maxAttempts"=3
      AND "claimedAt" IS NULL AND "leaseUntil" IS NULL
      AND "heartbeatAt" IS NULL AND "workerId" IS NULL
      AND "completedAt" IS NULL AND "lastError" IS NULL
      AND "idempotencyKey" ~ '^pinterest:(account|board)-sync:[a-z0-9]+:[0-9]+$'
      AND "payload"->>'accountId'=split_part("idempotencyKey", ':', 3)
      AND "runAfter">='2026-11-09 22:47:00'::timestamp
      AND "runAfter"<'2026-11-09 22:49:00'::timestamp
  )=count(*)
  AND count(*) FILTER (WHERE kind='PINTEREST_ACCOUNT_SYNC')<=1
  AND count(*) FILTER (WHERE kind='PINTEREST_BOARD_SYNC')<=1
  AND count(DISTINCT split_part("idempotencyKey", ':', 3)
    || ':' || split_part("idempotencyKey", ':', 4))<=1
THEN 1 ELSE 0 END
FROM blocking;
SQL
)"
  [[ "$(db saytwist "$queue_sql")" == 1 ]] || fail
  # A code-only release must preserve REVIEW mode; it never enables source Pin publication.
  [[ "$(db saytwist "SELECT CASE WHEN count(*)=1 AND bool_and(mode='REVIEW') THEN 1 ELSE 0 END FROM \"GrowthViralProgramSettings\" WHERE id='global';")" == 1 ]] || fail
  [[ "$(systemctl is-enabled saytwist-growth-viral-source.timer 2>/dev/null || true)" != enabled ]] || fail
  [[ "$(systemctl is-active saytwist-growth-viral-source.timer 2>/dev/null || true)" != active ]] || fail
}
count_migrations() {
  db "$1" 'SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;'
}
check_unit() {
  local p="$BASE/$1"
  [[ -f "$p" && ! -L "$p" && "$(stat -c '%u:%g:%a' "$p")" == 0:0:644 ]] || fail
  [[ -z "$(systemctl show -P DropInPaths "$1")" ]] || fail
}
check_files() {
  local sha="$1" i n prefix key persist
  for i in "${!NAMES[@]}"; do
    n="${NAMES[$i]}"
    prefix="saytwist-growth-$n"
    check_unit "$prefix.service"
    check_unit "$prefix.timer"
    key=EXPECTED_RELEASE; persist=false
    if [[ "$n" == lease-watchdog ]]; then
      key=WATCHDOG_EXPECTED_RELEASE_SHA; persist=true
    fi
    [[ "$(systemctl show -P User "$prefix.service")" == saytwist ]] || fail
    [[ "$(grep -Fxc "Environment=$key=$sha" "$BASE/$prefix.service")" == 1 ]] || fail
    systemctl show -P Environment "$prefix.service" |
      tr ' ' '\n' | grep -Fqx "$key=$sha" || fail
    [[ "$(grep -Fxc "OnCalendar=${CALENDARS[$i]}" "$BASE/$prefix.timer")" == 1 ]] || fail
    [[ "$(grep -Fxc "Persistent=$persist" "$BASE/$prefix.timer")" == 1 ]] || fail
    [[ "$(grep -Fxc 'AccuracySec=1s' "$BASE/$prefix.timer")" == 1 ]] || fail
    if [[ "$n" == private-report ]]; then
      [[ "$(grep -Fxc "Environment=GROWTH_PRIVATE_REPORT_APPROVAL=SAYTWIST_PRIVATE_DAILY_REPORT:$sha" "$BASE/$prefix.service")" == 1 ]] || fail
    else
      check_unit "$prefix-alert.service"
      [[ "$(grep -Fxc "OnFailure=$prefix-alert.service" "$BASE/$prefix.service")" == 1 ]] || fail
    fi
  done
}
check_timers() {
  local desired="$1" n prefix
  for n in "${NAMES[@]}"; do
    prefix="saytwist-growth-$n"
    [[ "$(systemctl is-enabled "$prefix.timer" 2>/dev/null || true)" == "$desired" ]] || fail
    if [[ "$desired" == enabled ]]; then
      systemctl is-active --quiet "$prefix.timer" || fail
    else
      ! systemctl is-active --quiet "$prefix.timer" || fail
    fi
    ! systemctl is-active --quiet "$prefix.service" || fail
  done
}
write_state() {
  local tmp
  tmp="$(mktemp "$BASE/.growth-nine-release-state.XXXXXXXX")" || fail
  printf 'old=%s\nnew=%s\nstatus=%s\n' "$OLD" "$NEW" "$1" > "$tmp"
  chmod 600 "$tmp"; chown root:root "$tmp"
  mv -f "$tmp" "$STATE"
}
check_state() {
  [[ -f "$STATE" && ! -L "$STATE" && "$(stat -c '%u:%g:%a' "$STATE")" == 0:0:600 ]] || fail
  [[ "$(cat "$STATE")" == "$(printf 'old=%s\nnew=%s\nstatus=HELD' "$OLD" "$NEW")" ]] || fail
}
on_exit() {
  local code="$?"
  if [[ "$code" != 0 && "$MODE" == hold && "${HOLD_STARTED:-0}" == 1 ]]; then
    systemctl disable --now "${TIMERS[@]}" >/dev/null 2>&1 || :
    echo 'GROWTH_NINE_RELEASE=PARTIAL_HOLD_OPERATOR_REQUIRED' >&2
  fi
  if [[ "$code" != 0 && "$MODE" == restore && "${RESTORE_STARTED:-0}" == 1 ]]; then
    systemctl disable --now "${OTHERS[@]}" >/dev/null 2>&1 || :
    echo 'GROWTH_NINE_RELEASE=PARTIAL_RESTORE_OPERATOR_REQUIRED' >&2
  fi
  if [[ "$code" != 0 && "$MODE" == recover && "${RECOVER_STARTED:-0}" == 1 ]]; then
    systemctl disable --now "${TIMERS[@]}" >/dev/null 2>&1 || :
    echo 'GROWTH_NINE_RELEASE=PARTIAL_RECOVERY_OPERATOR_REQUIRED' >&2
  fi
}
trap on_exit EXIT

quiet_window() {
  # Avoid releasing paid AI/Telegram schedules near their daily execution.
  # The existing approved 5-minute publisher still requires individual Pins.
  case "$(date -u +%H)" in
    00|01|02|03|15|16|17|18|19|20|21|22|23) ;;
    *) fail ;;
  esac
}

if [[ "$MODE" == audit || "$MODE" == hold ]]; then
  [[ "$(cat "$APP/.deployed-release")" == "$OLD" ]] || fail
  safe_db
  [[ "$(count_migrations saytwist)" == 35 ]] || fail
  check_files "$OLD"
  check_timers enabled
  if [[ "$MODE" == audit ]]; then
    echo 'GROWTH_NINE_AUDIT=PASSED'
    echo 'GROWTH_NINE_TIMERS=NINE_ENABLED_ACTIVE'
    echo 'GROWTH_NINE_DB=SAFE_OFF'
    exit 0
  fi
  quiet_window
  [[ "${GROWTH_NINE_RELEASE_APPROVAL:-}" == "HOLD:$OLD:$NEW" ]] || fail
  [[ ! -e "$STATE" ]] || fail
  curl -fsS --max-time 10 https://saytwist.com/api/readyz >/dev/null || fail
  HOLD_STARTED=1
  write_state HOLDING
  systemctl disable --now "${TIMERS[@]}" >/dev/null || fail
  check_timers disabled
  safe_db
  write_state HELD
  HOLD_STARTED=0
  echo 'GROWTH_NINE_HOLD=PASSED'
  echo 'GROWTH_NINE_TIMERS=NINE_DISABLED_INACTIVE'
  exit 0
fi

# Abort before application hotfix deploy: restore existing nine schedules on
# the OLD release, only when the old app and all 35 migrations remain intact.
if [[ "$MODE" == recover ]]; then
  [[ "${GROWTH_NINE_RELEASE_APPROVAL:-}" == "RECOVER:$OLD:$NEW" ]] || fail
  check_state
  [[ "$(cat "$APP/.deployed-release")" == "$OLD" ]] || fail
  [[ "$(count_migrations saytwist)" == 35 ]] || fail
  safe_db
  check_files "$OLD"
  check_timers disabled
  RECOVER_STARTED=1
  systemctl start saytwist-growth-lease-watchdog.service || fail
  [[ "$(systemctl show -P Result saytwist-growth-lease-watchdog.service)" == success ]] || fail
  systemctl enable --now saytwist-growth-lease-watchdog.timer >/dev/null || fail
  systemctl enable --now "${OTHERS[@]}" >/dev/null || fail
  check_files "$OLD"
  write_state RECOVERED
  RECOVER_STARTED=0
  echo 'GROWTH_NINE_RECOVER_OLD=PASSED'
  exit 0
fi

quiet_window
[[ "${GROWTH_NINE_RELEASE_APPROVAL:-}" == "RESTORE:$OLD:$NEW" ]] || fail
check_state
[[ "$(cat "$APP/.deployed-release")" == "$NEW" ]] || fail
curl -fsS --max-time 10 https://saytwist.com/api/readyz >/dev/null || fail
safe_db
[[ "$(count_migrations saytwist)" == 35 ]] || fail
check_files "$OLD"
check_timers disabled
RESTORE_STARTED=1
for n in "${NAMES[@]}"; do
  service="$BASE/saytwist-growth-$n.service"
  key=EXPECTED_RELEASE
  [[ "$n" == lease-watchdog ]] && key=WATCHDOG_EXPECTED_RELEASE_SHA
  tmp="$(mktemp "$BASE/.growth-nine-pin.XXXXXXXX")" || fail
  sed -e "s/^Environment=$key=$OLD$/Environment=$key=$NEW/" \
      -e "s/^Environment=GROWTH_PRIVATE_REPORT_APPROVAL=SAYTWIST_PRIVATE_DAILY_REPORT:$OLD$/Environment=GROWTH_PRIVATE_REPORT_APPROVAL=SAYTWIST_PRIVATE_DAILY_REPORT:$NEW/" \
      "$service" > "$tmp"
  chmod 644 "$tmp"; chown root:root "$tmp"
  mv -f "$tmp" "$service"
done
systemctl daemon-reload
check_files "$NEW"
check_timers disabled
for n in "${NAMES[@]}"; do
  prefix="saytwist-growth-$n"
  if [[ "$n" == private-report ]]; then
    systemd-analyze verify "$BASE/$prefix.service" "$BASE/$prefix.timer" >/dev/null || fail
  else
    systemd-analyze verify "$BASE/$prefix.service" "$BASE/$prefix.timer" "$BASE/$prefix-alert.service" >/dev/null || fail
  fi
done
safe_db
systemctl start saytwist-growth-lease-watchdog.service || fail
[[ "$(systemctl show -P Result saytwist-growth-lease-watchdog.service)" == success ]] || fail
systemctl enable --now saytwist-growth-lease-watchdog.timer >/dev/null || fail
systemctl is-active --quiet saytwist-growth-lease-watchdog.timer || fail
safe_db
# Previously approved eight non-watchdog timers; none is a missed-run catch-up.
systemctl enable --now "${OTHERS[@]}" >/dev/null || fail
# An already-approved timer may legitimately execute at its next tick.
for n in "${NAMES[@]}"; do
  systemctl is-enabled --quiet "saytwist-growth-$n.timer" || fail
  systemctl is-active --quiet "saytwist-growth-$n.timer" || fail
done
check_files "$NEW"
# Existing approved schedulers may legitimately start work as they resume.
# The strict empty-queue/lease gate was verified BEFORE any timer was enabled.
write_state RESTORED
RESTORE_STARTED=0
echo 'GROWTH_NINE_RESTORE=PASSED'
echo 'GROWTH_NINE_TIMERS=NINE_ENABLED_ACTIVE'
echo 'GROWTH_NINE_DB_GATE=SAFE_OFF_BEFORE_RESUME'
echo "GROWTH_NINE_RELEASE_SHA=$NEW"
