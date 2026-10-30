#!/usr/bin/env bash
set -Eeuo pipefail

APP_PATH="${HOSTINGER_APP_PATH:-/home/saytwist/htdocs/saytwist.com}"
NODE_BIN="${HOSTINGER_NODE_BIN:-/home/saytwist/.nvm/versions/node/v24.20.0/bin/node}"
ENV_FILE="${HOSTINGER_ENV_FILE:-$APP_PATH/.env}"
PRIVATE_RUNTIME_ENV=""
PM2_CLI="${HOSTINGER_PM2_CLI:-}"

MIGRATION_ROOT="${HOSTINGER_MIGRATION_ROOT:-}"
RELEASE_SHA="${HOSTINGER_RELEASE_SHA:-}"
APPROVED_MIGRATION="20261029220000_growth_worker_activation_expiry"
APPROVAL="${HOSTINGER_MIGRATION_APPROVAL:-}"
PG_DUMP_BIN="/usr/lib/postgresql/18/bin/pg_dump"
PG_RESTORE_BIN="/usr/lib/postgresql/18/bin/pg_restore"
PRISMA_CLI="$APP_PATH/node_modules/prisma/build/index.js"
BACKUP_ROOT="/home/saytwist/.local/share/saytwist/phase14-backups"
BACKUP_PATH="$BACKUP_ROOT/pre-migration-${APPROVED_MIGRATION}-${RELEASE_SHA:0:12}.dump"
HEALTH_BASE_URL="${HOSTINGER_HEALTH_BASE_URL:-http://127.0.0.1:3001}"
LOCK_DIR="$APP_PATH/.deploy-lock"

fail() {
  echo "[hostinger-migration][ERROR] $*" >&2
  exit 1
}

validate_executable_major() {
  local binary="$1" version major
  [[ -f "$binary" && -x "$binary" ]] || fail "Required PostgreSQL 18 executable is missing or not executable: $binary"
  version="$("$binary" --version)" || fail "Could not read PostgreSQL tool version: $binary"
  if [[ "$version" =~ PostgreSQL\)\ ([0-9]+)(\.|$) ]]; then
    major="${BASH_REMATCH[1]}"
  else
    fail "Could not parse PostgreSQL tool version: $binary"
  fi
  [[ "$major" == "18" ]] || fail "PostgreSQL backup tools must be major 18; refusing major $major."
}

validate_inputs() {
  [[ "$APP_PATH" == /* && "$APP_PATH" != "/" ]] || fail "HOSTINGER_APP_PATH must be a safe absolute path."
  [[ "$RELEASE_SHA" =~ ^[0-9a-f]{40}$ ]] || fail "HOSTINGER_RELEASE_SHA must be the reviewed full commit SHA."
  [[ "$MIGRATION_ROOT" == "/home/saytwist/.local/share/saytwist/phase14-rehearsal/$RELEASE_SHA" ]] || fail "Reviewed source must use the exact private SHA-scoped rehearsal directory."
  [[ "$MIGRATION_ROOT" != "$APP_PATH" && "$MIGRATION_ROOT" != "$APP_PATH/"* ]] \
    || fail "Migration staging must remain outside the live application directory."
  [[ "$APPROVAL" == "APPLY $APPROVED_MIGRATION" ]] || fail "Exact operator approval is required for $APPROVED_MIGRATION."
  [[ -x "$NODE_BIN" ]] || fail "Approved production Node.js binary is unavailable."
  [[ "$(id -un)" == "saytwist" ]] || fail "Migration requires the saytwist application SSH user."
  [[ -f "$PRISMA_CLI" ]] || fail "Existing production Prisma CLI is unavailable."
  [[ -f "$MIGRATION_ROOT/prisma/schema.prisma" ]] || fail "Reviewed Prisma schema is unavailable."
  [[ -f "$MIGRATION_ROOT/prisma/migrations/$APPROVED_MIGRATION/migration.sql" ]] || fail "Approved migration SQL is unavailable."
  [[ -f "$MIGRATION_ROOT/.release-sha" ]] || fail "Migration bundle release identity is unavailable."
  [[ -f "$MIGRATION_ROOT/scripts/growth-phase14-verify-clone.cjs" ]] || fail "Clone verification script missing."
  [[ "$(tr -d '[:space:]' < "$MIGRATION_ROOT/.release-sha")" == "$RELEASE_SHA" ]] || fail "Migration bundle SHA does not match the approved release SHA."
  validate_executable_major "$PG_DUMP_BIN"
  validate_executable_major "$PG_RESTORE_BIN"
}

acquire_lock() {
  mkdir "$LOCK_DIR" >/dev/null 2>&1 \
    || fail "A deployment or migration operation is already active."
  trap 'if [[ -n "${PRIVATE_RUNTIME_ENV:-}" ]]; then rm -f "$PRIVATE_RUNTIME_ENV"; fi; rmdir "$LOCK_DIR" >/dev/null 2>&1 || true' EXIT
}

# Hostinger normally stores the live DATABASE_URL in the existing PM2
# process rather than a file under the application. Materialize only a
# temporary mode-0600 env file outside htdocs; never print credentials.
resolve_runtime_environment() {
  if [[ -f "$ENV_FILE" ]]; then
    [[ -r "$ENV_FILE" ]] || fail "Configured production environment is unreadable."
    return
  fi
  [[ "$ENV_FILE" == "$APP_PATH/.env" ]] || fail "Explicit HOSTINGER_ENV_FILE is missing."
  local runtime_dir="/home/saytwist/.local/share/saytwist"
  install -d -m 700 "$runtime_dir"
  PRIVATE_RUNTIME_ENV="$(mktemp "$runtime_dir/.phase14-runtime.XXXXXXXX")" ||
    fail "Private runtime file creation failed."
  chmod 600 "$PRIVATE_RUNTIME_ENV"
  local node_dir="/home/saytwist/.nvm/versions/node/v24.20.0/bin"
  local verified_pm2="/home/saytwist/.npm/_npx/5f7878ce38f1eb13/node_modules/pm2/bin/pm2"
  [[ -n "$PM2_CLI" ]] || PM2_CLI="$verified_pm2"
  [[ "$PM2_CLI" == /* && -x "$PM2_CLI" ]] || fail "Verified existing PM2 CLI unavailable."
  HOSTINGER_PM2_CLI="$PM2_CLI" PRIVATE_ENV_PATH="$PRIVATE_RUNTIME_ENV" \
    "$NODE_BIN" -e '
      const fs = require("node:fs");
      const { execFileSync } = require("node:child_process");
      const pm2 = process.env.HOSTINGER_PM2_CLI;
      const file = process.env.PRIVATE_ENV_PATH;
      const apps = JSON.parse(execFileSync(pm2, ["jlist"], {
        encoding: "utf8", timeout: 15000, maxBuffer: 16 * 1024 * 1024,
        env: { ...process.env, PM2_HOME: "/home/saytwist/.pm2",
          PATH: "/home/saytwist/.nvm/versions/node/v24.20.0/bin:/usr/local/bin:/usr/bin:/bin" },
      }));
      const app = apps.find(a => a.name === "saytwist" && a.pm2_env?.status === "online");
      if (!app) process.exit(2);
      const env = app.pm2_env;
      for (const flag of ["GROWTH_WORKER_RUN_ENABLED",
        "GROWTH_DAILY_REPORT_SCHEDULE_ENABLED", "TELEGRAM_REPORTS_ENABLED",
        "GROWTH_ATTRIBUTION_COLLECTION_ENABLED"]) {
        if ((env[flag] ?? env.env?.[flag]) === "true") process.exit(3);
      }
      const url = env.DATABASE_URL ?? env.env?.DATABASE_URL;
      if (typeof url !== "string" || /[\r\n]/.test(url)) process.exit(4);
      const parsed = new URL(url);
      if (!["postgres:", "postgresql:"].includes(parsed.protocol) ||
          parsed.hostname !== "127.0.0.1" || parsed.port !== "5433" ||
          decodeURIComponent(parsed.pathname.slice(1)) !== "saytwist" ||
          parsed.searchParams.has("host")) process.exit(5);
      fs.writeFileSync(file, "DATABASE_URL=" + JSON.stringify(url) + "\n", { mode: 0o600 });
    ' >/dev/null || fail "Private PM2 runtime configuration rejected."
  ENV_FILE="$PRIVATE_RUNTIME_ENV"
}

validate_database_target() {
  "$NODE_BIN" --env-file="$ENV_FILE" -e '
    const url = new URL(process.env.DATABASE_URL || "");
    if (!(["postgres:", "postgresql:"].includes(url.protocol))) throw new Error("DATABASE_URL must use PostgreSQL");
    if (url.hostname !== "127.0.0.1" || url.port !== "5433" || decodeURIComponent(url.pathname.slice(1)) !== "saytwist") {
      throw new Error("Production database must remain private at 127.0.0.1:5433/saytwist");
    }
  ' || fail "Production database target validation failed."
}

check_runtime() {
  curl --fail --silent --show-error --max-time 5 "$HEALTH_BASE_URL/api/healthz" >/dev/null \
    || fail "The currently deployed application health check failed."
  curl --fail --silent --show-error --max-time 5 "$HEALTH_BASE_URL/api/readyz" >/dev/null \
    || fail "The currently deployed application readiness check failed."
}

validate_exact_pending_migration() {
  MIGRATION_ROOT="$MIGRATION_ROOT" APPROVED_MIGRATION="$APPROVED_MIGRATION" \
    "$NODE_BIN" --env-file="$ENV_FILE" -e '
      const fs = require("node:fs");
      const path = require("node:path");
      const { PrismaClient } = require(path.join(process.argv[1], "node_modules/@prisma/client"));
      const root = process.env.MIGRATION_ROOT;
      const approved = process.env.APPROVED_MIGRATION;
      const client = new PrismaClient();
      (async () => {
        const rows = await client.$queryRawUnsafe(
          `SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations" ORDER BY started_at`,
        );
        if (rows.some((row) => row.finished_at === null && row.rolled_back_at === null)) {
          throw new Error("Production contains an unfinished Prisma migration");
        }
        const applied = new Set(rows.filter((row) => row.finished_at !== null).map((row) => row.migration_name));
        const available = fs.readdirSync(path.join(root, "prisma/migrations"), { withFileTypes: true })
          .filter((entry) => entry.isDirectory())
          .map((entry) => entry.name)
          .sort();
        const pending = available.filter((name) => !applied.has(name));
        if (pending.length !== 1 || pending[0] !== approved) {
          throw new Error(`Expected only ${approved} pending; found ${pending.join(", ") || "none"}`);
        }
      })().finally(() => client.$disconnect());
    ' "$APP_PATH" || fail "Pending migration allow-list validation failed."
}

# Use the currently deployed Prisma runtime (pre-migration) for read-only gate checks.
# No worker or provider calls are allowed here.
validate_growth_off() {
  "$NODE_BIN" --env-file="$ENV_FILE" -e '
    const path = require("node:path");
    const { PrismaClient } = require(path.join(process.argv[1], "node_modules/@prisma/client"));
    const client = new PrismaClient();
    (async () => {
      const settings = await client.$queryRawUnsafe(
        "SELECT \"enabled\", \"attributionEnabled\" FROM \"GrowthSettings\" WHERE \"id\" = '\''global'\''");
      const queue = await client.$queryRawUnsafe(
        "SELECT COUNT(*)::int AS count FROM \"GrowthJob\" WHERE \"status\" IN ( '\''PENDING'\'', '\''CLAIMED'\'', '\''RUNNING'\'', '\''FAILED_RETRYABLE'\'' )");
      if (settings.length !== 1 || settings[0].enabled || settings[0].attributionEnabled ||
          queue.length !== 1 || queue[0].count !== 0) throw new Error("Growth gates or queue are not OFF/idle");
      console.log("[hostinger-migration] Growth database OFF, attribution OFF and active queue empty.");
    })().catch(() => { process.exitCode = 1; }).finally(() => client.$disconnect());
  ' "$APP_PATH" || fail "Growth OFF/empty queue preflight failed."
}

# Require the complete, reviewed Prisma migration on the populated clone.
validate_clone_rehearsal() {
  HOSTINGER_RELEASE_SHA="$RELEASE_SHA" "$NODE_BIN" --env-file="$ENV_FILE" \
    "$MIGRATION_ROOT/scripts/growth-phase14-verify-clone.cjs" >/dev/null \
    || fail "Populated-clone Prisma rehearsal precondition failed."
}

create_verified_backup() {
  mkdir -p "$BACKUP_ROOT"
  chmod 700 "$BACKUP_ROOT"
  [[ ! -e "$BACKUP_PATH" ]] || fail "Refusing to overwrite existing backup: $BACKUP_PATH"
  "$NODE_BIN" --env-file="$ENV_FILE" -e '
    const { spawnSync } = require("node:child_process");
    const url = new URL(process.env.DATABASE_URL);
    const env = { ...process.env };
    delete env.DATABASE_URL;
    Object.assign(env, {
      PGHOST: url.hostname,
      PGPORT: url.port,
      PGUSER: decodeURIComponent(url.username),
      PGPASSWORD: decodeURIComponent(url.password),
      PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
    });
    const result = spawnSync(process.argv[2], ["--format=custom", "--file", process.argv[1]], { env, stdio: "inherit" });
    process.exit(result.status ?? 1);
  ' "$BACKUP_PATH" "$PG_DUMP_BIN" || fail "Production backup failed."
  chmod 600 "$BACKUP_PATH"
  [[ -s "$BACKUP_PATH" ]] || fail "Production backup is empty."
  "$PG_RESTORE_BIN" --list "$BACKUP_PATH" >/dev/null || fail "Production backup could not be verified."
}

apply_approved_migration() {
  (
    cd "$MIGRATION_ROOT"
    "$NODE_BIN" --env-file="$ENV_FILE" "$PRISMA_CLI" migrate deploy --schema prisma/schema.prisma
    "$NODE_BIN" --env-file="$ENV_FILE" "$PRISMA_CLI" migrate status --schema prisma/schema.prisma
  )
}

main() {
  command -v curl >/dev/null 2>&1 || fail "curl is required."
  validate_inputs
  acquire_lock
  resolve_runtime_environment
  validate_database_target
  check_runtime
  validate_exact_pending_migration
  validate_growth_off
  validate_clone_rehearsal
  create_verified_backup
  apply_approved_migration
  check_runtime
  printf '%s\n' "release_sha=$RELEASE_SHA" "migration=$APPROVED_MIGRATION" "backup=$BACKUP_PATH" \
    > "$BACKUP_ROOT/pre-migration-${APPROVED_MIGRATION}-${RELEASE_SHA:0:12}.record"
  chmod 600 "$BACKUP_ROOT/pre-migration-${APPROVED_MIGRATION}-${RELEASE_SHA:0:12}.record"
  echo "[hostinger-migration] Approved migration applied; the old application remains healthy. Deployment is still a separate approval."
}

if [[ "${HOSTINGER_MIGRATION_SOURCE_ONLY:-0}" != "1" ]]; then
  main "$@"
fi
