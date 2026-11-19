#!/usr/bin/env bash
set -Eeuo pipefail

# Applies only the reviewed daily-plan migration before the matching app release.
# The deploy job runs this as the saytwist SSH user from a SHA-verified artifact.
APP_PATH="${HOSTINGER_APP_PATH:-/home/saytwist/htdocs/saytwist.com}"
NODE_BIN="${HOSTINGER_NODE_BIN:-/home/saytwist/.nvm/versions/node/v24.20.0/bin/node}"
ENV_FILE="${HOSTINGER_ENV_FILE:-$APP_PATH/.env.local}"
MIGRATION_ROOT="${HOSTINGER_MIGRATION_ROOT:-}"
RELEASE_SHA="${HOSTINGER_RELEASE_SHA:-}"
OLD_RELEASE_SHA="610b55e0ee0a36ce2ba67245dc34ed8d195030b2"
APPROVED_MIGRATION="20261119090000_growth_daily_plan_targets"
APPROVAL="${HOSTINGER_MIGRATION_APPROVAL:-}"
PG_DUMP_BIN="/usr/lib/postgresql/18/bin/pg_dump"
PG_RESTORE_BIN="/usr/lib/postgresql/18/bin/pg_restore"
PRISMA_CLI="$APP_PATH/node_modules/prisma/build/index.js"
BACKUP_ROOT="/home/saytwist/.local/share/saytwist/growth-daily-plan-migrations"
LOCK_DIR="$APP_PATH/.deploy-lock"

fail() { echo "[hostinger-daily-plan-migration] BLOCKED: $*" >&2; exit 1; }

[[ "$(id -un)" == "saytwist" ]] || fail "Must run as the saytwist application user."
[[ "$APP_PATH" == "/home/saytwist/htdocs/saytwist.com" ]] || fail "Unexpected application path."
[[ "$RELEASE_SHA" =~ ^[a-f0-9]{40}$ ]] || fail "Invalid release SHA."
[[ "$APPROVAL" == "APPLY $APPROVED_MIGRATION" ]] || fail "Exact migration approval is required."
[[ "$MIGRATION_ROOT" == "/home/saytwist/.local/share/saytwist/growth-daily-plan/$RELEASE_SHA" ]] || fail "Unexpected private migration bundle path."
[[ "$MIGRATION_ROOT" != "$APP_PATH" && "$MIGRATION_ROOT" != "$APP_PATH/"* ]] || fail "Migration bundle must be outside the web root."
[[ -f "$MIGRATION_ROOT/.release-sha" && ! -L "$MIGRATION_ROOT/.release-sha" ]] || fail "Release marker missing."
[[ "$(tr -d '[:space:]' < "$MIGRATION_ROOT/.release-sha")" == "$RELEASE_SHA" ]] || fail "Artifact SHA mismatch."
export HOSTINGER_MIGRATION_ROOT="$MIGRATION_ROOT"
export APPROVED_MIGRATION
[[ -f "$MIGRATION_ROOT/prisma/schema.prisma" && -f "$MIGRATION_ROOT/prisma/migrations/$APPROVED_MIGRATION/migration.sql" ]] || fail "Reviewed migration files missing."
[[ -x "$NODE_BIN" && -f "$ENV_FILE" && -f "$PRISMA_CLI" ]] || fail "Production runtime prerequisites are missing."
for binary in "$PG_DUMP_BIN" "$PG_RESTORE_BIN"; do
  [[ -x "$binary" ]] || fail "PostgreSQL 18 backup tools are unavailable."
  version="$("$binary" --version)"
  [[ "$version" =~ PostgreSQL\)\ 18(\.|$) ]] || fail "PostgreSQL backup tools must be major 18."
done
[[ "$(tr -d '[:space:]' < "$APP_PATH/.deployed-release")" == "$OLD_RELEASE_SHA" ]] || fail "Live application SHA changed."
curl -fsS --max-time 5 http://127.0.0.1:3001/api/healthz >/dev/null || fail "Live app health check failed."
curl -fsS --max-time 5 http://127.0.0.1:3001/api/readyz >/dev/null || fail "Live app readiness check failed."
mkdir "$LOCK_DIR" 2>/dev/null || fail "Another deployment or migration holds the lock."
trap 'rmdir "$LOCK_DIR" >/dev/null 2>&1 || true' EXIT

validate_database() {
  HOSTINGER_ENV_FILE="$ENV_FILE" "$NODE_BIN" --env-file="$ENV_FILE" -e '
    const fs=require("node:fs"), path=require("node:path");
    const {PrismaClient}=require(path.join(process.argv[1],"node_modules/@prisma/client"));
    const root=process.env.HOSTINGER_MIGRATION_ROOT;
    const expected=process.env.APPROVED_MIGRATION;
    const client=new PrismaClient();
    (async()=>{
      const url=new URL(process.env.DATABASE_URL||"");
      if(!["postgres:","postgresql:"].includes(url.protocol)||url.hostname!=="127.0.0.1"||url.port!=="5433"||decodeURIComponent(url.pathname.slice(1))!=="saytwist"||url.searchParams.has("host")) throw Error("DATABASE_TARGET");
      const digest=require("node:crypto");
      const rows=await client.$queryRawUnsafe(`SELECT migration_name,checksum,finished_at,rolled_back_at FROM "_prisma_migrations" ORDER BY started_at`);
      if(rows.some(r=>!r.finished_at&&!r.rolled_back_at)) throw Error("UNFINISHED_MIGRATION");
      const applied=rows.filter(r=>r.finished_at&&!r.rolled_back_at);
      const names=fs.readdirSync(path.join(root,"prisma/migrations"),{withFileTypes:true}).filter(x=>x.isDirectory()).map(x=>x.name).sort();
      if(applied.length===41){
        if(names.length!==42||names[41]!==expected) throw Error("SOURCE_MIGRATION_SET");
        for(let i=0;i<applied.length;i++){if(applied[i].migration_name!==names[i]) throw Error("BASELINE_ORDER");}
        for(const row of applied){const bytes=fs.readFileSync(path.join(root,"prisma/migrations",row.migration_name,"migration.sql")); if(digest.createHash("sha256").update(bytes).digest("hex")!==row.checksum) throw Error("BASELINE_CHECKSUM");}
        if(names.filter(n=>!applied.some(r=>r.migration_name===n)).join(",")!==expected) throw Error("PENDING_SET");
      } else if(applied.length===42&&applied.at(-1).migration_name===expected){
        const bytes=fs.readFileSync(path.join(root,"prisma/migrations",expected,"migration.sql"));
        if(digest.createHash("sha256").update(bytes).digest("hex")!==applied.at(-1).checksum) throw Error("APPLIED_CHECKSUM");
        const columns=await client.$queryRawUnsafe(`SELECT count(*)::int AS count FROM information_schema.columns WHERE table_schema='public' AND table_name='GrowthDailyCadencePreference' AND column_name IN ('newTranslatorPins','existingTranslatorPins','anythingTranslatePins')`);
        const plan=await client.$queryRawUnsafe(`SELECT "newTranslatorPins","existingTranslatorPins","anythingTranslatePins" FROM "GrowthDailyCadencePreference" WHERE id='global'`);
        const cap=await client.$queryRawUnsafe(`SELECT "aiImagesPerDayCap" FROM "GrowthSettings" WHERE id='global'`);
        if(columns[0]?.count!==3||plan.length!==1||plan[0].newTranslatorPins!==1||plan[0].existingTranslatorPins!==2||plan[0].anythingTranslatePins!==2||cap[0]?.aiImagesPerDayCap!==5) throw Error("POST_MIGRATION_SCHEMA");
        console.log("ALREADY_APPLIED"); return;
      } else throw Error("MIGRATION_COUNT");
      const settings=await client.$queryRawUnsafe(`SELECT "enabled","attributionEnabled" FROM "GrowthSettings" WHERE id='global'`);
      const jobs=await client.$queryRawUnsafe(`SELECT count(*)::int AS count FROM "GrowthJob" WHERE status IN ('PENDING','CLAIMED','RUNNING','FAILED_RETRYABLE')`);
      if(settings.length!==1||settings[0].enabled||settings[0].attributionEnabled||jobs[0]?.count!==0) throw Error("GROWTH_NOT_IDLE");
      const pref=await client.$queryRawUnsafe(`SELECT "newTranslatorPins","existingTranslatorPins","anythingTranslatePins" FROM "GrowthDailyCadencePreference" WHERE id='global'`);
      if(pref.length!==1) throw Error("CADENCE_ROW_MISSING");
      if(applied.length===42&&(pref[0].newTranslatorPins!==1||pref[0].existingTranslatorPins!==2||pref[0].anythingTranslatePins!==2)) throw Error("DAILY_PLAN_DEFAULTS");
    })().catch(e=>{console.error(e.message);process.exitCode=1}).finally(()=>client.$disconnect());
  ' "$APP_PATH" || fail "Production database preflight failed."
}

db_state="$(validate_database 2>&1)" || fail "Production database preflight failed."
mkdir -p "$BACKUP_ROOT"
chmod 700 "$BACKUP_ROOT"
BACKUP="$BACKUP_ROOT/pre-${APPROVED_MIGRATION}-${RELEASE_SHA:0:12}.dump"
if [[ ! -e "$BACKUP" ]]; then
  "$NODE_BIN" --env-file="$ENV_FILE" -e '
    const {spawnSync}=require("node:child_process");const u=new URL(process.env.DATABASE_URL);const e={...process.env};delete e.DATABASE_URL;
    Object.assign(e,{PGHOST:u.hostname,PGPORT:u.port,PGUSER:decodeURIComponent(u.username),PGPASSWORD:decodeURIComponent(u.password),PGDATABASE:decodeURIComponent(u.pathname.slice(1))});
    const r=spawnSync(process.argv[2],["--format=custom","--file",process.argv[1]],{env:e,stdio:"inherit"});process.exit(r.status??1);
  ' "$BACKUP" "$PG_DUMP_BIN" || fail "Database backup failed."
  chmod 600 "$BACKUP"
fi
[[ -s "$BACKUP" ]] || fail "Database backup is empty."
"$PG_RESTORE_BIN" --list "$BACKUP" >/dev/null || fail "Database backup could not be verified."

if [[ "$db_state" == *ALREADY_APPLIED* ]]; then
  echo "[hostinger-daily-plan-migration] Already applied for this release."
  exit 0
fi
(
  cd "$MIGRATION_ROOT"
  "$NODE_BIN" --env-file="$ENV_FILE" "$PRISMA_CLI" migrate deploy --schema "$MIGRATION_ROOT/prisma/schema.prisma"
  "$NODE_BIN" --env-file="$ENV_FILE" "$PRISMA_CLI" migrate status --schema "$MIGRATION_ROOT/prisma/schema.prisma"
)
validate_database >/dev/null || fail "Post-migration database verification failed."
curl -fsS --max-time 5 http://127.0.0.1:3001/api/readyz >/dev/null || fail "App readiness failed after migration."
printf 'release_sha=%s\nmigration=%s\nbackup=%s\n' "$RELEASE_SHA" "$APPROVED_MIGRATION" "$BACKUP" > "$BACKUP_ROOT/pre-${APPROVED_MIGRATION}-${RELEASE_SHA:0:12}.record"
chmod 600 "$BACKUP_ROOT/pre-${APPROVED_MIGRATION}-${RELEASE_SHA:0:12}.record"
echo "[hostinger-daily-plan-migration] APPLIED; prior app remains healthy."
