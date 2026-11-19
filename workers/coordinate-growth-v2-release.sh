#!/usr/bin/env bash
set -Eeuo pipefail
# Exact OLD-SHA, 12-timer production hold / restore / recover coordinator.
# This release adds exactly four independently approved, additive Prisma migrations.
# Only the audited four-job queue or an empty queue is admitted; full evidence is frozen across hold/restore.
# Deploy must never apply migrations; stop at operator-controlled rehearsal and backup.
# Must be copied outside the application tree as root:root mode 0700.
fail() {
  if [[ "${TIMERS_HELD:-false}" == true ]]; then
    systemctl disable --now $TIMERS >/dev/null 2>&1 || true
  fi
  echo 'GROWTH_TWELVE_RELEASE=BLOCKED' >&2; exit 1
}
trap 'trap - ERR; fail' ERR
[[ "$(id -u)" == 0 && "$#" == 3 ]] || fail
[[ -f "$0" && ! -L "$0" && "$(stat -c '%u:%g:%a' "$0")" == 0:0:700 ]] || fail
MODE="$1"; OLD="$2"; NEW="$3"
[[ "$MODE" == audit || "$MODE" == hold || "$MODE" == restore || "$MODE" == recover ]] || fail
[[ "$OLD" == a5d93f7e50a87007e046dbac34976b46304b98a9 ]] || fail
[[ "$NEW" =~ ^[a-f0-9]{40}$ && "$NEW" != "$OLD" ]] || fail
APP=/home/saytwist/htdocs/saytwist.com
BASE=/etc/systemd/system
STATE=/etc/saytwist-growth-v2-release-state
SOURCE=/etc/saytwist-growth-viral-source-approval.env
PSQL=/usr/lib/postgresql/18/bin/psql
NAMES='lease-watchdog daily-observe autonomous-cycle approved-publisher daily-fresh private-report autonomous-content daily-account-analytics auto-translator-publish viral-discovery viral-source pin-maintenance'
TIMERS=''
for name in $NAMES; do TIMERS="$TIMERS saytwist-growth-$name.timer"; done
db() { runuser -u postgres -- "$PSQL" -X -qAt -v ON_ERROR_STOP=1 -p 5433 -d saytwist -c "$1"; }
safe_db() {
  local query result
  query="$(cat <<'SQL'
WITH active AS (
 SELECT j.*, to_jsonb(j) AS job_evidence, to_jsonb(p) AS publication_evidence,
        to_jsonb(a) AS approval_evidence, to_jsonb(c) AS candidate_evidence,
        CASE WHEN j.status='PENDING' AND j."attemptCount"=0 AND j."maxAttempts"=3
          AND j."claimedAt" IS NULL AND j."leaseUntil" IS NULL
          AND j."heartbeatAt" IS NULL AND j."workerId" IS NULL
          AND j."completedAt" IS NULL AND j."lastError" IS NULL
        THEN CASE
          WHEN j.id IN ('cmwgfd45e0011a54w9jnuohxv','cmwgfd45r0014a54wamp268oz') THEN
            (j.id='cmwgfd45e0011a54w9jnuohxv' AND j.type='PINTEREST_ACCOUNT_SYNC'
             AND j."idempotencyKey"='pinterest:account-sync:cmwgfd44v000ya54wraf6ai89:29911031'
             AND j."runAfter"='2026-11-14 13:11:49.826'::timestamp)
            OR (j.id='cmwgfd45r0014a54wamp268oz' AND j.type='PINTEREST_BOARD_SYNC'
             AND j."idempotencyKey"='pinterest:board-sync:cmwgfd44v000ya54wraf6ai89:29911031'
             AND j."runAfter"='2026-11-14 13:11:49.838'::timestamp)
          WHEN j.id IN ('cmwg7v9eq0074a5nq5naty2vo','cmwg7v0mh0070a5nqcr94z8c8') THEN
            j.type='PINTEREST_PIN_PUBLISH' AND p.status='SCHEDULED'
            AND p."pinterestPinId" IS NULL AND p."attemptCount"=0
            AND p."scheduledAt"=j."runAfter" AND a."scheduledAt"=p."scheduledAt"
            AND a.status='APPROVED' AND a."approvedById" IS NOT NULL AND a."reviewedAt" IS NOT NULL
            AND a."candidateId"=p."candidateId" AND a."candidateRevision"=c.revision
            AND a."accountId"=p."accountId" AND a."boardId"=p."boardId" AND c.status='READY'
            AND p."accountId"='cmuvr3r5m0010a56v2mwzp035'
            AND j."idempotencyKey"='pinterest-publish:' || p.id
            AND j.payload=jsonb_build_object('publicationId',p.id)
            AND ((j.id='cmwg7v9eq0074a5nq5naty2vo' AND p.id='76f727f6-faba-4e98-b9ef-a2e822a9b1ff'
              AND p."candidateId"='cmwemrcg3000za5vqw7af0pjk' AND p."scheduledAt"='2026-11-14 18:00:00'::timestamp)
             OR (j.id='cmwg7v0mh0070a5nqcr94z8c8' AND p.id='8e9760ff-90da-48a5-adc6-15ffc66a2e7c'
              AND p."candidateId"='cmwemqo0e000ea5vqxcc401cu' AND p."scheduledAt"='2026-11-14 23:00:00'::timestamp))
          ELSE false END ELSE false END AS verified
 FROM "GrowthJob" j
 LEFT JOIN "GrowthPinPublication" p ON p."publishJobId"=j.id
 LEFT JOIN "GrowthPinApproval" a ON a.id=p."approvalId"
 LEFT JOIN "GrowthPinCandidate" c ON c.id=p."candidateId"
 WHERE j.status IN ('PENDING','CLAIMED','RUNNING','FAILED_RETRYABLE')
), queue AS (
 SELECT count(*) AS n, bool_and(COALESCE(verified,false) AND
   (type='PINTEREST_PIN_PUBLISH' OR payload='{"accountId":"cmwgfd44v000ya54wraf6ai89"}'::jsonb)) AS verified,
   encode(sha256(convert_to(COALESCE(jsonb_agg(jsonb_build_array(job_evidence,publication_evidence,approval_evidence,candidate_evidence) ORDER BY id)::text,'[]'),'UTF8')),'hex') AS fingerprint
 FROM active
)
SELECT CASE WHEN
  EXISTS(SELECT 1 FROM "GrowthSettings" WHERE id='global'
    AND NOT "enabled" AND NOT "attributionEnabled"
    AND "workerActivationExpiresAt" IS NULL)
  AND (queue.n=0 OR (queue.n=4 AND queue.verified))
  AND EXISTS(SELECT 1 FROM "GrowthViralProgramSettings" WHERE id='global'
    AND mode='ACTIVE' AND "sourceSharePercent"=50 AND "maxPinsPerDay"=5)
THEN 'SAFE:' || queue.fingerprint ELSE 'BLOCKED' END FROM queue;
SQL
)"
  result="$(db "$query")" || fail
  [[ "$result" =~ ^SAFE:([a-f0-9]{64})$ ]] || fail
  if [[ -n "${QUEUE_FINGERPRINT:-}" ]]; then
    [[ "$QUEUE_FINGERPRINT" == "${BASH_REMATCH[1]}" ]] || fail
  else
    QUEUE_FINGERPRINT="${BASH_REMATCH[1]}"
  fi
}
count_migrations() { db 'SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;'; }
calendar() {
  case "$1" in
    lease-watchdog) echo '*-*-* *:*:00' ;;
    daily-observe) echo '*-*-* 13:00:00 UTC' ;;
    autonomous-cycle) echo '*-*-* 04:30:00 UTC' ;;
    approved-publisher) echo '*-*-* *:00/5:00 UTC' ;;
    daily-fresh) echo '*-*-* 06:45:00 UTC' ;;
    private-report) echo '*-*-* 05:05:00 UTC' ;;
    autonomous-content) echo '*-*-* 06:00:00 UTC' ;;
    daily-account-analytics) echo '*-*-* 04:20:00 UTC' ;;
    auto-translator-publish) echo '*-*-* 06:30:00 UTC' ;;
    viral-discovery) echo '*-*-* 05:30:00 UTC' ;;
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
  printf 'old=%s\nnew=%s\nmigrations=%s\nqueue=%s\nstatus=%s\n' "$OLD" "$NEW" "$MIGRATIONS" "$QUEUE_FINGERPRINT" "$1" > "$tmp"
  chown root:root "$tmp"; chmod 0600 "$tmp"
  mv -f "$tmp" "$STATE"
}
check_state() {
  local expected
  [[ -f "$STATE" && ! -L "$STATE" && "$(stat -c '%u:%g:%a' "$STATE")" == 0:0:600 ]] || fail
  # Hold records exactly 36 completed migrations; restore must see the
  # independent, approved additive migration set (#37–40), not the old count.
  expected="$(printf 'old=%s\nnew=%s\nmigrations=%s\nqueue=%s\nstatus=HELD' "$OLD" "$NEW" "36" "$QUEUE_FINGERPRINT")"
  [[ "$(cat "$STATE")" == "$expected" ]] || fail
}
quiet_window() {
  case "$(date -u +%H)" in
    00|01|02|03|15|16|17|18|19|20|21|22|23) ;;
    *) fail ;;
  esac
}
MIGRATIONS="$(count_migrations)" || fail
[[ "$MIGRATIONS" =~ ^[0-9]+$ ]] || fail
case "$MODE" in
  audit|hold) [[ "$MIGRATIONS" == 36 ]] || fail ;;
  restore) [[ "$MIGRATIONS" == 40 ]] || fail ;;
  recover) [[ "$MIGRATIONS" == 36 || "$MIGRATIONS" == 40 ]] || fail ;;
esac
if [[ "$MODE" == restore ]]; then
  [[ "$(db "SELECT count(*) FROM \"_prisma_migrations\" WHERE migration_name IN ('20261115120000_growth_unified_approvals','20261115130000_growth_intelligence_coverage','20261115140000_growth_viral_evidence_windows','20261115150000_growth_google_analytics') AND finished_at IS NOT NULL AND rolled_back_at IS NULL;")" == 4 ]] || fail
fi
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
  TIMERS_HELD=true
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
TIMERS_HELD=true
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
echo 'GROWTH_TWELVE_DB=SAFE_OFF_UNCHANGED_REVIEWED_QUEUE'
echo "GROWTH_TWELVE_RELEASE_SHA=$NEW"
