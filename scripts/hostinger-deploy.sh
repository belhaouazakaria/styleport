#!/usr/bin/env bash
set -Eeuo pipefail

APP_PATH="${HOSTINGER_APP_PATH:-$(pwd)}"
DEPLOY_ARCHIVE="${HOSTINGER_DEPLOY_ARCHIVE:-$APP_PATH/release.tar.gz}"
LOCK_DIR="$APP_PATH/.deploy-lock"
RELEASE_ID="$(date +%Y%m%d%H%M%S)"
STAGING_DIR="$APP_PATH/.deploy-stage-$RELEASE_ID"
DEPLOY_DEBUG="${HOSTINGER_DEPLOY_DEBUG:-0}"
CURRENT_STEP="bootstrap"
DEPLOY_STATUS="failed"

if [[ "$DEPLOY_DEBUG" == "1" ]]; then
  set -x
fi

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
  exit 1
}

step() {
  CURRENT_STEP="$1"
  log "Starting step."
}

load_profile_if_exists() {
  local profile_path="$1"
  if [[ -f "$profile_path" ]]; then
    # shellcheck disable=SC1090
    . "$profile_path" >/dev/null 2>&1 || true
  fi
}

prepend_path_if_dir_exists() {
  local dir_path="$1"
  if [ -d "$dir_path" ]; then
    case ":$PATH:" in
      *":$dir_path:"*) return 0 ;;
    esac
    PATH="$dir_path:$PATH"
    export PATH
    log "Added PATH candidate: $dir_path"
    return 0
  fi
  log "Skipping missing PATH candidate: $dir_path"
}

bootstrap_runtime_path_candidates() {
  local candidate

  for candidate in \
    "/usr/local/bin" \
    "/usr/bin" \
    "/bin" \
    "$HOME/bin" \
    "$HOME/.local/bin" \
    "$HOME/.npm-global/bin"; do
    prepend_path_if_dir_exists "$candidate"
  done

  # Hostinger/cPanel alt-node locations (explicit, shell-portable checks).
  for candidate in \
    "/opt/alt/alt-nodejs18/root/usr/bin" \
    "/opt/alt/alt-nodejs20/root/usr/bin" \
    "/opt/alt/alt-nodejs22/root/usr/bin" \
    "/opt/alt/alt-nodejs24/root/usr/bin"; do
    prepend_path_if_dir_exists "$candidate"
  done

  # Optional common alternatives.
  for candidate in \
    "/opt/nodejs18/bin" \
    "/opt/nodejs20/bin" \
    "/opt/nodejs22/bin" \
    "/opt/nodejs24/bin"; do
    prepend_path_if_dir_exists "$candidate"
  done
}

print_runtime_diagnostics() {
  log "Runtime diagnostics:"
  log "shell=${SHELL:-unknown}"
  log "user=$(whoami 2>/dev/null || echo unknown)"
  log "pwd=$(pwd 2>/dev/null || echo unknown)"
  log "PATH=$PATH"
  log "command -v node => $(command -v node 2>/dev/null || echo not-found)"
  log "command -v npm  => $(command -v npm 2>/dev/null || echo not-found)"

  if ls -d /opt/alt/alt-nodejs* >/dev/null 2>&1; then
    log "Detected /opt/alt/alt-nodejs* directories:"
    ls -d /opt/alt/alt-nodejs* 2>/dev/null || true
  fi

  if ls -1 /opt/alt/alt-nodejs*/root/usr/bin/node >/dev/null 2>&1; then
    log "Candidate node binaries:"
    ls -1 /opt/alt/alt-nodejs*/root/usr/bin/node 2>/dev/null || true
  fi

  if ls -1 /opt/alt/alt-nodejs*/root/usr/bin/npm >/dev/null 2>&1; then
    log "Candidate npm binaries:"
    ls -1 /opt/alt/alt-nodejs*/root/usr/bin/npm 2>/dev/null || true
  fi
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

acquire_lock() {
  step "lock"
  if mkdir "$LOCK_DIR" >/dev/null 2>&1; then
    log "Acquired deploy lock: $LOCK_DIR"
    return
  fi
  fail "Another deployment appears to be running. Lock path: $LOCK_DIR"
}

validate_environment() {
  step "environment"
  mkdir -p "$APP_PATH"
  ensure_directory_exists "$APP_PATH"
  ensure_directory_writable "$APP_PATH"
  cd "$APP_PATH"
  log "App path: $APP_PATH"
  print_runtime_diagnostics

  ensure_command_exists node
  ensure_command_exists npm

  log "which node: $(command -v node)"
  log "which npm: $(command -v npm)"
  log "node version: $(node -v 2>/dev/null || echo unknown)"
  log "npm version: $(npm -v 2>/dev/null || echo unknown)"
}

validate_archive() {
  step "validate-archive"
  log "Deploy archive path: $DEPLOY_ARCHIVE"
  ensure_command_exists tar
  ensure_file_exists "$DEPLOY_ARCHIVE"

  local archive_dir
  archive_dir="$(dirname "$DEPLOY_ARCHIVE")"
  log "Archive parent directory listing ($archive_dir):"
  ls -la "$archive_dir"

  log "Validating archive readability..."
  tar -tzf "$DEPLOY_ARCHIVE" >/dev/null

  log "Archive top-level preview:"
  tar -tzf "$DEPLOY_ARCHIVE" | head -n 40 || true
}

extract_archive() {
  step "extract"
  mkdir -p "$STAGING_DIR"
  ensure_directory_exists "$STAGING_DIR"
  ensure_directory_writable "$STAGING_DIR"
  log "Extracting archive into staging dir: $STAGING_DIR"
  tar -xzf "$DEPLOY_ARCHIVE" -C "$STAGING_DIR"

  log "Staging directory content:"
  ls -la "$STAGING_DIR"
}

validate_staging_layout() {
  step "validate-staging"
  ensure_file_exists "$STAGING_DIR/package.json"
  ensure_directory_exists "$STAGING_DIR/.next"
  ensure_directory_exists "$STAGING_DIR/node_modules"
  ensure_directory_exists "$STAGING_DIR/public"
  ensure_file_exists "$STAGING_DIR/server.js"
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
  ensure_directory_writable "$staging_generated_dir"
  log "Preserving generated assets from $existing_generated_dir into staging."
  cp -a "$existing_generated_dir/." "$staging_generated_dir/"
}

replace_path_from_staging() {
  local rel_path="$1"
  local source_path="$STAGING_DIR/$rel_path"
  local target_path="$APP_PATH/$rel_path"

  if [[ ! -e "$source_path" && ! -L "$source_path" ]]; then
    warn "Skipping '$rel_path' (not present in staging)."
    return
  fi

  if [[ -e "$target_path" || -L "$target_path" ]]; then
    log "Removing existing target path: $target_path"
    rm -rf "$target_path"
  fi

  log "Publishing '$rel_path'"
  mv "$source_path" "$target_path"
}

publish_release() {
  step "publish"
  replace_path_from_staging ".next"
  replace_path_from_staging "public"
  replace_path_from_staging "prisma"
  replace_path_from_staging "node_modules"
  replace_path_from_staging "package.json"
  replace_path_from_staging "package-lock.json"
  replace_path_from_staging "next.config.ts"
  replace_path_from_staging "server.js"
  replace_path_from_staging "next-env.d.ts"

  rm -f "$DEPLOY_ARCHIVE"
  log "Removed archive: $DEPLOY_ARCHIVE"
}

signal_restart() {
  step "restart"
  if [[ -f "$APP_PATH/tmp/restart.txt" ]]; then
    touch "$APP_PATH/tmp/restart.txt"
    log "Restart signal sent via tmp/restart.txt"
    return
  fi

  warn "tmp/restart.txt not found. Restart the Node.js app from Hostinger hPanel if needed."
}

cleanup() {
  step "cleanup"
  rm -rf "$STAGING_DIR" >/dev/null 2>&1 || true
  rmdir "$LOCK_DIR" >/dev/null 2>&1 || true
  log "Cleanup complete (status=$DEPLOY_STATUS)."
}

on_error() {
  local exit_code="$?"
  local line_no="${BASH_LINENO[0]:-unknown}"
  local cmd="${BASH_COMMAND:-unknown}"
  echo "[hostinger][$(timestamp)][${CURRENT_STEP}][ERROR] Command failed with exit ${exit_code} at line ${line_no}: ${cmd}" >&2
  echo "[hostinger][$(timestamp)][${CURRENT_STEP}][ERROR] pwd=$(pwd 2>/dev/null || echo unknown)" >&2
  echo "[hostinger][$(timestamp)][${CURRENT_STEP}][ERROR] PATH=${PATH}" >&2
  exit "$exit_code"
}

trap on_error ERR
trap cleanup EXIT INT TERM

step "bootstrap"
log "Bootstrapping shell environment..."
load_profile_if_exists "$HOME/.profile"
load_profile_if_exists "$HOME/.bash_profile"
load_profile_if_exists "$HOME/.bashrc"
load_profile_if_exists "$HOME/.zshrc"
bootstrap_runtime_path_candidates

acquire_lock
validate_environment
validate_archive
extract_archive
validate_staging_layout
preserve_generated_assets
publish_release
signal_restart

DEPLOY_STATUS="success"
step "done"
log "Deployment complete."
