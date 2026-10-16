#!/usr/bin/env bash
set -Eeuo pipefail

APP_PATH="${HOSTINGER_APP_PATH:-$(pwd)}"
DEPLOY_ARCHIVE="${HOSTINGER_DEPLOY_ARCHIVE:-$APP_PATH/release.tar.gz}"
NODE_BIN_DIR="${HOSTINGER_NODE_BIN:-/home/saytwist/.nvm/versions/node/v24.20.0/bin}"
PM2_PROCESS="${HOSTINGER_PM2_PROCESS:-saytwist}"
PM2_CLI="${HOSTINGER_PM2_CLI:-}"
PM2_HOME_DIR="${HOSTINGER_PM2_HOME:-/home/saytwist/.pm2}"
EXPECTED_PM2_HOME="/home/saytwist/.pm2"
EXPECTED_PM2_VERSION="${HOSTINGER_EXPECTED_PM2_VERSION:-7.0.4}"
EXPECTED_PORT="${HOSTINGER_EXPECTED_PORT:-3001}"
PM2_CONTRACT_SCRIPT="${HOSTINGER_PM2_CONTRACT_SCRIPT:-$APP_PATH/scripts/pm2-process-contract.mjs}"
PG_DUMP_BIN="/usr/lib/postgresql/18/bin/pg_dump"
PG_RESTORE_BIN="/usr/lib/postgresql/18/bin/pg_restore"
EXPECTED_POSTGRESQL_BACKUP_MAJOR="18"
HEALTH_BASE_URL=""
PRODUCTION_ENV_FILE="${HOSTINGER_ENV_FILE:-$APP_PATH/.env}"
EXPECT_NO_PENDING_MIGRATIONS="${HOSTINGER_EXPECT_NO_PENDING_MIGRATIONS:-1}"
RELEASE_SHA="${HOSTINGER_RELEASE_SHA:-unknown}"
LOCK_DIR="$APP_PATH/.deploy-lock"
RELEASE_ID="$(date +%Y%m%d%H%M%S)-${RELEASE_SHA:0:12}"
STAGING_DIR="$APP_PATH/.deploy-stage-$RELEASE_ID"
ROLLBACK_ROOT="$APP_PATH/.deploy-releases"
ROLLBACK_DIR="$ROLLBACK_ROOT/$RELEASE_ID"
BACKUP_ROOT="$APP_PATH/.deploy-backups"
DATABASE_BACKUP="$BACKUP_ROOT/saytwist-$RELEASE_ID.dump"
CURRENT_STEP="bootstrap"
DEPLOY_STATUS="failed"
PUBLISH_STARTED=0
OLD_WEB_PID=""
OLD_RESTART_COUNT=""
PM2_DAEMON_PID=""

RELEASE_PATHS=(
  ".next"
  "public"
  "prisma"
  "lib"
  "workers"
  "ecosystem.config.cjs"
  "tsconfig.json"
  "node_modules"
  "package.json"
  "package-lock.json"
  "next.config.ts"
  "server.js"
  "next-env.d.ts"
)
BACKED_UP_PATHS=()
PUBLISHED_PATHS=()

timestamp() {
  date +"%Y-%m-%dT%H:%M:%S%z"
}

log() {
  echo "[hostinger][$(timestamp)][${CURRENT_STEP}] $*"
}

warn() {
  echo "[hostinger][$(timestamp)][${CURRENT_STEP}][WARN] $*" >&2
}

fail() {
  echo "[hostinger][$(timestamp)][${CURRENT_STEP}][ERROR] $*" >&2
  trap - ERR
  set +e
  rollback_application
  exit 1
}

step() {
  CURRENT_STEP="$1"
  log "Starting step."
}

ensure_command_exists() {
  local command_name="$1"
  command -v "$command_name" >/dev/null 2>&1 || fail "Required command '$command_name' is not available."
}

ensure_file_exists() {
  local file_path="$1"
  [[ -f "$file_path" ]] || fail "Required file missing: $file_path"
}

ensure_directory_exists() {
  local dir_path="$1"
  [[ -d "$dir_path" ]] || fail "Required directory missing: $dir_path"
}

ensure_directory_writable() {
  local dir_path="$1"
  [[ -w "$dir_path" ]] || fail "Directory is not writable: $dir_path"
}

validate_safe_app_path() {
  [[ "$APP_PATH" == /* ]] || fail "HOSTINGER_APP_PATH must be absolute."
  [[ "$APP_PATH" != "/" && "$APP_PATH" != "$HOME" ]] || fail "Refusing unsafe application path."
}

bootstrap_runtime() {
  step "runtime"
  ensure_file_exists "$NODE_BIN_DIR/node"
  ensure_file_exists "$NODE_BIN_DIR/npm"
  PATH="$NODE_BIN_DIR:$HOME/.local/bin:$HOME/.npm-global/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
  export PATH

  [[ "$(command -v node)" == "$NODE_BIN_DIR/node" ]] || fail "The approved production Node.js binary was not selected."
  [[ "$(command -v npm)" == "$NODE_BIN_DIR/npm" ]] || fail "The approved production npm binary was not selected."
  ensure_command_exists curl
  ensure_command_exists tar

  ensure_file_exists "$PM2_CONTRACT_SCRIPT"
  log "node=$(node --version), npm=$(npm --version), node_path=$(command -v node)"
}

validate_postgresql_backup_tools() {
  step "validate-postgresql-backup-tools"
  local binary label version major

  for binary in "$PG_DUMP_BIN" "$PG_RESTORE_BIN"; do
    label="$(basename "$binary")"
    [[ -f "$binary" && -x "$binary" ]] || fail "Required PostgreSQL 18 backup executable is missing or not executable: $binary"
    version="$("$binary" --version)" || fail "Could not read the version of $binary"
    if [[ "$version" =~ PostgreSQL\)\ ([0-9]+)(\.|$) ]]; then
      major="${BASH_REMATCH[1]}"
    else
      fail "Could not parse the PostgreSQL client version reported by $binary"
    fi
    [[ "$major" == "$EXPECTED_POSTGRESQL_BACKUP_MAJOR" ]] \
      || fail "$label must be PostgreSQL major $EXPECTED_POSTGRESQL_BACKUP_MAJOR; refusing incompatible client version $major."
    log "Validated $label major $major at $binary."
  done
}

run_pm2() {
  PM2_HOME="$PM2_HOME_DIR" "$PM2_CLI" "$@"
}

read_pm2_daemon_pid() {
  local daemon_pid
  ensure_file_exists "$PM2_HOME_DIR/pm2.pid"
  daemon_pid="$(tr -d '[:space:]' < "$PM2_HOME_DIR/pm2.pid")"
  [[ "$daemon_pid" =~ ^[1-9][0-9]*$ ]] || fail "The existing PM2 daemon PID file is invalid."
  kill -0 "$daemon_pid" >/dev/null 2>&1 || fail "The existing PM2 daemon is not running."
  printf '%s' "$daemon_pid"
}

validate_pm2_cli() {
  step "validate-pm2-cli"
  [[ -n "$PM2_CLI" ]] || fail "HOSTINGER_PM2_CLI must provide the existing absolute PM2 CLI path."
  [[ "$PM2_CLI" == /* ]] || fail "HOSTINGER_PM2_CLI must be absolute."
  [[ -x "$PM2_CLI" ]] || fail "The operator-supplied PM2 CLI is missing or not executable: $PM2_CLI"
  [[ "$PM2_HOME_DIR" == /* ]] || fail "HOSTINGER_PM2_HOME must be absolute."
  [[ "$PM2_HOME_DIR" == "$EXPECTED_PM2_HOME" ]] || fail "HOSTINGER_PM2_HOME does not match the verified production daemon home."
  ensure_directory_exists "$PM2_HOME_DIR"
  [[ -S "$PM2_HOME_DIR/rpc.sock" ]] || fail "The existing PM2 RPC socket is unavailable."
  [[ -S "$PM2_HOME_DIR/pub.sock" ]] || fail "The existing PM2 publish socket is unavailable."
  PM2_DAEMON_PID="$(read_pm2_daemon_pid)"

  local reported_version daemon_pid_after
  reported_version="$(run_pm2 --version)" || fail "The supplied PM2 CLI could not connect using PM2_HOME=$PM2_HOME_DIR."
  [[ "$reported_version" == "$EXPECTED_PM2_VERSION" ]] || fail "Expected PM2 $EXPECTED_PM2_VERSION but the supplied CLI reported $reported_version."
  daemon_pid_after="$(read_pm2_daemon_pid)"
  [[ "$daemon_pid_after" == "$PM2_DAEMON_PID" ]] || fail "PM2 daemon identity changed during CLI validation; refusing to continue."
  run_pm2 jlist >/dev/null || fail "The supplied PM2 CLI could not query the existing daemon."
  daemon_pid_after="$(read_pm2_daemon_pid)"
  [[ "$daemon_pid_after" == "$PM2_DAEMON_PID" ]] || fail "PM2 daemon identity changed while querying the process list."
  log "Connected PM2 CLI $PM2_CLI (version=$reported_version) to the existing daemon pid=$PM2_DAEMON_PID."
}

acquire_lock() {
  step "lock"
  if mkdir "$LOCK_DIR" >/dev/null 2>&1; then
    log "Acquired deploy lock."
    return
  fi
  fail "Another deployment appears to be running."
}

validate_environment() {
  step "environment"
  validate_safe_app_path
  ensure_directory_exists "$APP_PATH"
  ensure_directory_writable "$APP_PATH"
  [[ "$EXPECT_NO_PENDING_MIGRATIONS" == "1" ]] || fail "This release only permits an already up-to-date migration state."
  [[ "$RELEASE_SHA" =~ ^[0-9a-f]{40}$ ]] || fail "HOSTINGER_RELEASE_SHA must be the full Git commit SHA."
  cd "$APP_PATH"

  if [[ ! -f "$PRODUCTION_ENV_FILE" ]]; then
    PRODUCTION_ENV_FILE="$STAGING_DIR/.production-runtime.env"
    (
      umask 077
      # shellcheck disable=SC2016
      run_pm2 jlist | node -e '
        const fs = require("node:fs");
        let input = "";
        process.stdin.setEncoding("utf8");
        process.stdin.on("data", (chunk) => { input += chunk; });
        process.stdin.on("end", () => {
          const item = JSON.parse(input).find((entry) => entry.name === process.argv[1]);
          const value = item?.pm2_env?.DATABASE_URL;
          if (!value) process.exit(2);
          fs.writeFileSync(process.argv[2], `DATABASE_URL=${JSON.stringify(value)}\n`, { mode: 0o600 });
        });
      ' "$PM2_PROCESS" "$PRODUCTION_ENV_FILE"
    ) || fail "DATABASE_URL was not available from the application .env or existing PM2 process."
    log "Using the existing PM2 process database configuration."
  else
    log "Using the existing application environment file."
  fi

  node --env-file="$PRODUCTION_ENV_FILE" -e '
    const value = process.env.DATABASE_URL;
    if (!value) throw new Error("DATABASE_URL is missing from the production environment file");
    const url = new URL(value);
    if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") throw new Error("DATABASE_URL must use PostgreSQL");
    if (url.hostname !== "127.0.0.1" || url.port !== "5433") throw new Error("Production PostgreSQL must remain private on 127.0.0.1:5433");
    if (decodeURIComponent(url.pathname.slice(1)) !== "saytwist") throw new Error("Unexpected production database name");
  '
  log "Production configuration is present and targets the approved private PostgreSQL endpoint."
}

validate_archive() {
  step "validate-archive"
  ensure_file_exists "$DEPLOY_ARCHIVE"
  tar -tzf "$DEPLOY_ARCHIVE" >/dev/null
  log "Release archive is readable."
}

extract_archive() {
  step "extract"
  mkdir -p "$STAGING_DIR"
  ensure_directory_writable "$STAGING_DIR"
  tar -xzf "$DEPLOY_ARCHIVE" -C "$STAGING_DIR"
}

validate_staging_layout() {
  step "validate-staging"
  ensure_file_exists "$STAGING_DIR/.release-sha"
  [[ "$(tr -d '[:space:]' < "$STAGING_DIR/.release-sha")" == "$RELEASE_SHA" ]] \
    || fail "Release archive identity does not match HOSTINGER_RELEASE_SHA."
  ensure_file_exists "$STAGING_DIR/.next/BUILD_ID"
  ensure_directory_exists "$STAGING_DIR/public"
  ensure_directory_exists "$STAGING_DIR/prisma/migrations"
  ensure_directory_exists "$STAGING_DIR/lib"
  ensure_directory_exists "$STAGING_DIR/workers"
  ensure_directory_exists "$STAGING_DIR/node_modules"
  ensure_file_exists "$STAGING_DIR/package.json"
  ensure_file_exists "$STAGING_DIR/package-lock.json"
  ensure_file_exists "$STAGING_DIR/server.js"
  ensure_file_exists "$STAGING_DIR/ecosystem.config.cjs"
  ensure_file_exists "$STAGING_DIR/next.config.ts"
  ensure_file_exists "$STAGING_DIR/next-env.d.ts"
  ensure_file_exists "$STAGING_DIR/tsconfig.json"
  ensure_file_exists "$STAGING_DIR/workers/editorial-worker.ts"
  ensure_file_exists "$STAGING_DIR/workers/growth-worker.ts"
  ensure_file_exists "$STAGING_DIR/node_modules/prisma/build/index.js"
  ensure_file_exists "$STAGING_DIR/node_modules/tsx/dist/cli.mjs"
  ensure_file_exists "$STAGING_DIR/node_modules/.prisma/client/libquery_engine-debian-openssl-1.1.x.so.node"
  ensure_file_exists "$STAGING_DIR/node_modules/.prisma/client/libquery_engine-debian-openssl-3.0.x.so.node"

  node -e '
    const config = require(process.argv[1]);
    const app = config?.apps?.find((candidate) => candidate.name === process.argv[2]);
    const expectedNpm = process.argv[3];
    const expectedCwd = process.argv[4];
    const expectedPort = process.argv[5];
    if (!app || app.script !== expectedNpm || app.args !== "start" || app.cwd !== expectedCwd || app.instances !== 1 || app.exec_mode !== "fork" || String(app.env?.PORT) !== expectedPort || app.env?.NODE_ENV !== "production") process.exit(1);
  ' "$STAGING_DIR/ecosystem.config.cjs" "$PM2_PROCESS" "$NODE_BIN_DIR/npm" "$APP_PATH" "$EXPECTED_PORT" || fail "Artifact PM2 configuration does not document the existing SayTwist npm start contract."
  log "Artifact layout and PM2 configuration are valid."
}

get_pm2_process_info() {
  run_pm2 jlist | node "$PM2_CONTRACT_SCRIPT" \
    "$PM2_PROCESS" "$NODE_BIN_DIR/npm" "$APP_PATH" "$PM2_HOME_DIR" "$EXPECTED_PORT"
}

validate_pm2_process() {
  step "validate-pm2"
  local info status exec_path cwd runtime_port daemon_pid_after
  info="$(get_pm2_process_info)" || fail "The existing PM2 process '$PM2_PROCESS' failed its npm start runtime contract."
  IFS=$'\t' read -r OLD_WEB_PID status exec_path cwd OLD_RESTART_COUNT runtime_port <<<"$info"
  daemon_pid_after="$(read_pm2_daemon_pid)"
  [[ "$daemon_pid_after" == "$PM2_DAEMON_PID" ]] || fail "The PM2 daemon identity changed during process validation."
  HEALTH_BASE_URL="http://127.0.0.1:$runtime_port"
  log "Verified existing PM2 npm start process '$PM2_PROCESS' (pid=$OLD_WEB_PID, restarts=$OLD_RESTART_COUNT, port=$runtime_port, cwd=$cwd)."
  log "Only '$PM2_PROCESS' will be restarted; all other PM2 processes, including an editorial worker, are left untouched."
}

create_database_backup() {
  step "database-backup"
  mkdir -p "$BACKUP_ROOT"
  chmod 700 "$BACKUP_ROOT"
  [[ ! -e "$DATABASE_BACKUP" ]] || fail "Refusing to overwrite an existing database backup."

  node --env-file="$PRODUCTION_ENV_FILE" -e '
    const { spawnSync } = require("node:child_process");
    const url = new URL(process.env.DATABASE_URL);
    const env = { ...process.env };
    delete env.DATABASE_URL;
    env.PGHOST = url.hostname;
    env.PGPORT = url.port;
    env.PGUSER = decodeURIComponent(url.username);
    env.PGPASSWORD = decodeURIComponent(url.password);
    env.PGDATABASE = decodeURIComponent(url.pathname.slice(1));
    const result = spawnSync(process.argv[2], ["--format=custom", "--file", process.argv[1]], { env, stdio: "inherit" });
    process.exit(result.status ?? 1);
  ' "$DATABASE_BACKUP" "$PG_DUMP_BIN"

  chmod 600 "$DATABASE_BACKUP"
  [[ -s "$DATABASE_BACKUP" ]] || fail "The production database backup is empty."
  "$PG_RESTORE_BIN" --list "$DATABASE_BACKUP" >/dev/null
  log "Verified production database backup: $DATABASE_BACKUP"
}

run_prisma() {
  (
    cd "$STAGING_DIR"
    node --env-file="$PRODUCTION_ENV_FILE" node_modules/prisma/build/index.js "$@"
  )
}

validate_no_pending_migrations() {
  step "migration-status"
  if ! run_prisma migrate status; then
    fail "Migration status is not up to date. Production migrations require a separate operator-approved backup and pre-migration procedure, so deployment stopped before changing application files."
  fi
  log "Migration state is current. This deployment script never executes production migrations."
}

preserve_generated_assets() {
  step "preserve-generated-assets"
  local existing_generated_dir="$APP_PATH/public/generated"
  local staging_generated_dir="$STAGING_DIR/public/generated"

  if [[ ! -d "$existing_generated_dir" ]]; then
    log "No existing generated asset directory to preserve."
    return
  fi

  mkdir -p "$staging_generated_dir"
  cp -a "$existing_generated_dir/." "$staging_generated_dir/"
  log "Copied persistent generated assets into the staged release."
}

backup_current_release() {
  step "backup-current-release"
  local rel_path target_path backup_path
  PUBLISH_STARTED=1
  mkdir -p "$ROLLBACK_DIR"

  for rel_path in "${RELEASE_PATHS[@]}"; do
    target_path="$APP_PATH/$rel_path"
    backup_path="$ROLLBACK_DIR/$rel_path"
    if [[ -e "$target_path" || -L "$target_path" ]]; then
      mkdir -p "$(dirname "$backup_path")"
      mv "$target_path" "$backup_path"
      BACKED_UP_PATHS+=("$rel_path")
    fi
  done
  log "Saved the previous application release at $ROLLBACK_DIR"
}

publish_release() {
  step "publish"
  local rel_path source_path target_path

  for rel_path in "${RELEASE_PATHS[@]}"; do
    source_path="$STAGING_DIR/$rel_path"
    target_path="$APP_PATH/$rel_path"
    [[ -e "$source_path" || -L "$source_path" ]] || fail "Staged release path disappeared before publish: $rel_path"
    mkdir -p "$(dirname "$target_path")"
    mv "$source_path" "$target_path"
    PUBLISHED_PATHS+=("$rel_path")
  done
  log "Published all validated release paths. Persistent storage was not replaced."
}

wait_for_health() {
  local attempt
  for attempt in $(seq 1 30); do
    if curl --fail --silent --show-error --max-time 5 "$HEALTH_BASE_URL/api/healthz" >/dev/null 2>&1 \
      && curl --fail --silent --show-error --max-time 5 "$HEALTH_BASE_URL/api/readyz" >/dev/null 2>&1; then
      log "Health and readiness checks passed on attempt $attempt."
      return 0
    fi
    sleep 2
  done
  return 1
}

restart_web_process() {
  step "restart-web"
  local info new_pid status exec_path cwd restart_count runtime_port daemon_pid_after
  run_pm2 restart "$PM2_PROCESS" >/dev/null || fail "PM2 failed to restart the existing web process."

  info="$(get_pm2_process_info)" || fail "PM2 process disappeared after restart."
  IFS=$'\t' read -r new_pid status exec_path cwd restart_count runtime_port <<<"$info"
  [[ "$new_pid" != "$OLD_WEB_PID" ]] || fail "PM2 retained the old web PID; refusing to report the new release as active."
  [[ "$restart_count" =~ ^[0-9]+$ && "$OLD_RESTART_COUNT" =~ ^[0-9]+$ && "$restart_count" -gt "$OLD_RESTART_COUNT" ]] \
    || fail "PM2 did not record a restart of the existing process."
  daemon_pid_after="$(read_pm2_daemon_pid)"
  [[ "$daemon_pid_after" == "$PM2_DAEMON_PID" ]] || fail "The PM2 daemon changed during application restart."
  HEALTH_BASE_URL="http://127.0.0.1:$runtime_port"
  wait_for_health || fail "The restarted web process failed health or readiness checks."
  log "PM2 restarted '$PM2_PROCESS' from pid=$OLD_WEB_PID to pid=$new_pid (restarts=$restart_count)."
}

rollback_application() {
  [[ "$PUBLISH_STARTED" == "1" ]] || return 0
  CURRENT_STEP="rollback"
  warn "Restoring the previous application release. Database rollback is intentionally not automatic."
  local failed_dir="$STAGING_DIR/failed-release"
  local rel_path target_path backup_path failed_path rollback_info rollback_port
  mkdir -p "$failed_dir"

  for rel_path in "${PUBLISHED_PATHS[@]}"; do
    target_path="$APP_PATH/$rel_path"
    failed_path="$failed_dir/$rel_path"
    if [[ -e "$target_path" || -L "$target_path" ]]; then
      mkdir -p "$(dirname "$failed_path")"
      mv "$target_path" "$failed_path"
    fi
  done

  for rel_path in "${BACKED_UP_PATHS[@]}"; do
    target_path="$APP_PATH/$rel_path"
    backup_path="$ROLLBACK_DIR/$rel_path"
    if [[ -e "$backup_path" || -L "$backup_path" ]]; then
      mkdir -p "$(dirname "$target_path")"
      mv "$backup_path" "$target_path"
    fi
  done

  run_pm2 restart "$PM2_PROCESS" >/dev/null 2>&1 || warn "PM2 restart of the restored npm start process failed; operator intervention is required."
  if rollback_info="$(get_pm2_process_info)"; then
    IFS=$'\t' read -r _ _ _ _ _ rollback_port <<<"$rollback_info"
    HEALTH_BASE_URL="http://127.0.0.1:$rollback_port"
  else
    warn "The restored process no longer matches the original npm start runtime contract."
  fi
  wait_for_health || warn "The restored release did not become healthy; operator intervention is required."
}

finalize_release() {
  step "finalize"
  printf '%s\n' "$RELEASE_SHA" > "$APP_PATH/.deployed-release"
  rm -f "$DEPLOY_ARCHIVE"
  PUBLISH_STARTED=0
  log "Recorded deployed release $RELEASE_SHA and removed the uploaded archive."
}

cleanup() {
  local exit_code="$?"
  rm -rf "$STAGING_DIR" >/dev/null 2>&1 || true
  rmdir "$LOCK_DIR" >/dev/null 2>&1 || true
  log "Cleanup complete (status=$DEPLOY_STATUS)."
  return "$exit_code"
}

on_error() {
  local exit_code="$?"
  local line_no="${BASH_LINENO[0]:-unknown}"
  local cmd="${BASH_COMMAND:-unknown}"
  trap - ERR
  set +e
  echo "[hostinger][$(timestamp)][${CURRENT_STEP}][ERROR] Command failed with exit ${exit_code} at line ${line_no}: ${cmd}" >&2
  rollback_application
  exit "$exit_code"
}

main() {
  trap on_error ERR
  trap cleanup EXIT
  trap 'exit 130' INT TERM

  validate_safe_app_path
  bootstrap_runtime
  validate_postgresql_backup_tools
  acquire_lock
  validate_archive
  extract_archive
  validate_staging_layout
  validate_pm2_cli
  validate_pm2_process
  validate_environment
  create_database_backup
  validate_no_pending_migrations
  preserve_generated_assets
  backup_current_release
  publish_release
  restart_web_process
  finalize_release

  DEPLOY_STATUS="success"
  step "done"
  log "Deployment complete."
}

if [[ "${HOSTINGER_DEPLOY_SOURCE_ONLY:-0}" != "1" ]]; then
  main "$@"
fi
