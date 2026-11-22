#!/usr/bin/env bash
set -Eeuo pipefail
# One-time exact-SHA analytics reliability hotfix. Preserve all eleven approved timers and independent publication gates.
# NO migration, quota change, global worker enablement or Pin activation. Exact OLD/NEW SHA.
# Copy the exact reviewed blob to a root-owned 0700 file outside application
# directories before executing. This script never installs a new timer.
fail() { echo 'GROWTH_ELEVEN_RELEASE=BLOCKED' >&2; exit 1; }
[[ "$(id -u)" == 0 && "$#" == 3 ]] || fail
[[ -f "$0" && ! -L "$0" && "$(stat -c '%u:%g:%a' "$0")" == 0:0:700 ]] || fail
MODE="$1"; OLD="$2"; NEW="$3"
[[ "$MODE" == audit || "$MODE" == hold || "$MODE" == restore || "$MODE" == recover ]] || fail
[[ "$OLD" =~ ^[a-f0-9]{40}$ && "$NEW" =~ ^[a-f0-9]{40}$ && "$OLD" != "$NEW" ]] || fail
[[ "$OLD" == 103fb7324b277cbea63bb200e32247636db10a79 && "$NEW" == 104b3597e58178190f0d1aace7137001fb8b4458 ]] || fail

APP=/home/saytwist/htdocs/saytwist.com
BASE=/etc/systemd/system
STATE=/etc/saytwist-growth-eleven-analytics-fix-release-state
SOURCE_ENV=/etc/saytwist-growth-viral-source-approval.env
PSQL=/usr/lib/postgresql/18/bin/psql
NAMES=(
  lease-watchdog daily-observe autonomous-cycle approved-publisher
  daily-fresh private-report autonomous-content daily-account-analytics
  auto-translator-publish viral-discovery viral-source
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
  '*-*-* 08:15:00 UTC'
  '*-*-* 15..23:17:00 UTC'
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
  # Strictly require an empty active queue; the two owner-requested 2026-11-09
  # Pinterest jobs already completed successfully. Never rewrite job statuses.
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
  # Preserve owner-configured ACTIVE, 50/5 mode without any write.
  [[ "$(db saytwist "SELECT CASE WHEN count(*)=1 AND bool_and(mode='ACTIVE' AND \"sourceSharePercent\"=50 AND \"maxPinsPerDay\"=5) THEN 1 ELSE 0 END FROM \"GrowthViralProgramSettings\" WHERE id='global';")" == 1 ]] || fail
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
    elif [[ "$n" == viral-discovery ]]; then
      [[ "$(grep -Fxc "Environment=GROWTH_VIRAL_DISCOVERY_OWNER_APPROVAL=SAYTWIST_VIRAL_DISCOVERY:$sha" "$BASE/$prefix.service")" == 1 ]] || fail
      check_unit "$prefix-alert.service"
      [[ "$(grep -Fxc "OnFailure=$prefix-alert.service" "$BASE/$prefix.service")" == 1 ]] || fail
    else
      check_unit "$prefix-alert.service"
      [[ "$(grep -Fxc "OnFailure=$prefix-alert.service" "$BASE/$prefix.service")" == 1 ]] || fail
    fi
  done
  [[ -f "$SOURCE_ENV" && ! -L "$SOURCE_ENV" &&
     "$(stat -c '%u:%g:%a' "$SOURCE_ENV")" == 0:0:600 ]] || fail
  [[ "$(grep -Fxc 'GROWTH_VIRAL_SOURCE_ENABLED=true' "$SOURCE_ENV")" == 1 ]] || fail
  [[ "$(grep -Fxc "GROWTH_VIRAL_SOURCE_OWNER_APPROVAL=SAYTWIST_VIRAL_SOURCE:$sha" "$SOURCE_ENV")" == 1 ]] || fail
  [[ "$(wc -l < "$SOURCE_ENV")" == 2 ]] || fail
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
  tmp="$(mktemp "$BASE/.growth-eleven-release-state.XXXXXXXX")" || fail
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
    echo 'GROWTH_ELEVEN_RELEASE=PARTIAL_HOLD_OPERATOR_REQUIRED' >&2
  fi
  if [[ "$code" != 0 && "$MODE" == restore && "${RESTORE_STARTED:-0}" == 1 ]]; then
    systemctl disable --now "${OTHERS[@]}" >/dev/null 2>&1 || :
    echo 'GROWTH_ELEVEN_RELEASE=PARTIAL_RESTORE_OPERATOR_REQUIRED' >&2
  fi
  if [[ "$code" != 0 && "$MODE" == recover && "${RECOVER_STARTED:-0}" == 1 ]]; then
    systemctl disable --now "${TIMERS[@]}" >/dev/null 2>&1 || :
    echo 'GROWTH_ELEVEN_RELEASE=PARTIAL_RECOVERY_OPERATOR_REQUIRED' >&2
  fi
}
trap on_exit EXIT

if [[ "$MODE" == audit || "$MODE" == hold ]]; then
  # Require evidence that the previous release was fully restored, without
  # touching or rewriting that immutable operator audit trail.
  PREVIOUS=/etc/saytwist-growth-eleven-queued-sync-release-state
  [[ -f "$PREVIOUS" && ! -L "$PREVIOUS" &&
     "$(stat -c '%u:%g:%a' "$PREVIOUS")" == 0:0:600 ]] || fail
  [[ "$(cat "$PREVIOUS")" == "$(printf 'old=%s\nnew=%s\nstatus=RESTORED' '217f97d2e07f0f29933e3dab02b35034a3401419' '103fb7324b277cbea63bb200e32247636db10a79')" ]] || fail
  [[ "$(cat "$APP/.deployed-release")" == "$OLD" ]] || fail
  safe_db
  [[ "$(count_migrations saytwist)" == 35 ]] || fail
  check_files "$OLD"
  check_timers enabled
  if [[ "$MODE" == audit ]]; then
    echo 'GROWTH_ELEVEN_AUDIT=PASSED'
    echo 'GROWTH_ELEVEN_TIMERS=ELEVEN_ENABLED_ACTIVE'
    echo 'GROWTH_ELEVEN_DB=SAFE_OFF'
    exit 0
  fi
  [[ "${GROWTH_ELEVEN_RELEASE_APPROVAL:-}" == "HOLD:$OLD:$NEW" ]] || fail
  [[ ! -e "$STATE" ]] || fail
  curl -fsS --max-time 10 https://saytwist.com/api/readyz >/dev/null || fail
  HOLD_STARTED=1
  write_state HOLDING
  systemctl disable --now "${TIMERS[@]}" >/dev/null || fail
  check_timers disabled
  safe_db
  write_state HELD
  HOLD_STARTED=0
  echo 'GROWTH_ELEVEN_HOLD=PASSED'
  echo 'GROWTH_ELEVEN_TIMERS=ELEVEN_DISABLED_INACTIVE'
  exit 0
fi

# Abort before application hotfix deploy: restore all existing eleven schedules on
# the OLD release, only when the old app and all 35 migrations remain intact.
if [[ "$MODE" == recover ]]; then
  [[ "${GROWTH_ELEVEN_RELEASE_APPROVAL:-}" == "RECOVER:$OLD:$NEW" ]] || fail
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
  echo 'GROWTH_ELEVEN_RECOVER_OLD=PASSED'
  exit 0
fi

[[ "${GROWTH_ELEVEN_RELEASE_APPROVAL:-}" == "RESTORE:$OLD:$NEW" ]] || fail
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
  tmp="$(mktemp "$BASE/.growth-eleven-pin.XXXXXXXX")" || fail
  sed -e "s/^Environment=$key=$OLD$/Environment=$key=$NEW/" \
      -e "s/^Environment=GROWTH_PRIVATE_REPORT_APPROVAL=SAYTWIST_PRIVATE_DAILY_REPORT:$OLD$/Environment=GROWTH_PRIVATE_REPORT_APPROVAL=SAYTWIST_PRIVATE_DAILY_REPORT:$NEW/" \
      -e "s/^Environment=GROWTH_VIRAL_DISCOVERY_OWNER_APPROVAL=SAYTWIST_VIRAL_DISCOVERY:$OLD$/Environment=GROWTH_VIRAL_DISCOVERY_OWNER_APPROVAL=SAYTWIST_VIRAL_DISCOVERY:$NEW/" \
      "$service" > "$tmp"
  chmod 644 "$tmp"; chown root:root "$tmp"
  mv -f "$tmp" "$service"
done
# The source publisher approval is a root-owned 0600 EnvironmentFile,
# not a systemd unit line. Re-pin it only after HOLD and exact deploy.
tmp="$(mktemp /etc/.saytwist-viral-source-approval.XXXXXXXX)" || fail
printf 'GROWTH_VIRAL_SOURCE_ENABLED=true\nGROWTH_VIRAL_SOURCE_OWNER_APPROVAL=SAYTWIST_VIRAL_SOURCE:%s\n' "$NEW" > "$tmp"
chmod 600 "$tmp"; chown root:root "$tmp"
mv -f "$tmp" "$SOURCE_ENV"
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
# Previously approved ten non-watchdog timers; none is a missed-run catch-up.
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
echo 'GROWTH_ELEVEN_RESTORE=PASSED'
echo 'GROWTH_ELEVEN_TIMERS=ELEVEN_ENABLED_ACTIVE'
echo 'GROWTH_ELEVEN_DB_GATE=SAFE_OFF_BEFORE_RESUME'
echo "GROWTH_ELEVEN_RELEASE_SHA=$NEW"
