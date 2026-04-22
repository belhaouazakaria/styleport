#!/usr/bin/env sh
set -eu

APP_PATH="${HOSTINGER_APP_PATH:-$(pwd)}"
DEPLOY_ARCHIVE="${HOSTINGER_DEPLOY_ARCHIVE:-$APP_PATH/release.tar.gz}"
LOCK_DIR="$APP_PATH/.deploy-lock"
RELEASE_ID="$(date +%Y%m%d%H%M%S)"
STAGING_DIR="$APP_PATH/.deploy-stage-$RELEASE_ID"

log() {
  echo "[hostinger] $*"
}

fail() {
  log "ERROR: $*"
  exit 1
}

load_profile_if_exists() {
  profile_path="$1"
  if [ -f "$profile_path" ]; then
    # shellcheck disable=SC1090
    . "$profile_path" >/dev/null 2>&1 || true
  fi
}

cleanup() {
  rm -rf "$STAGING_DIR" >/dev/null 2>&1 || true
  rmdir "$LOCK_DIR" >/dev/null 2>&1 || true
}

acquire_lock() {
  if mkdir "$LOCK_DIR" >/dev/null 2>&1; then
    return
  fi
  fail "Another deployment is already running. Lock path: $LOCK_DIR"
}

validate_runtime() {
  if ! command -v node >/dev/null 2>&1; then
    fail "Node.js was not found in this SSH session PATH."
  fi

  log "Using node: $(command -v node)"
  node --version || true
}

validate_archive() {
  if [ ! -f "$DEPLOY_ARCHIVE" ]; then
    fail "Deploy archive not found at $DEPLOY_ARCHIVE"
  fi

  if ! command -v tar >/dev/null 2>&1; then
    fail "'tar' is required on the server to extract release bundles."
  fi
}

validate_staging_layout() {
  [ -f "$STAGING_DIR/package.json" ] || fail "Staging bundle missing package.json"
  [ -d "$STAGING_DIR/.next" ] || fail "Staging bundle missing .next build output"
  [ -d "$STAGING_DIR/node_modules" ] || fail "Staging bundle missing node_modules"
}

publish_staging_to_app_root() {
  log "Publishing release into app root..."

  for path in \
    ".next" \
    "public" \
    "prisma" \
    "node_modules" \
    "package.json" \
    "package-lock.json" \
    "next.config.ts" \
    "server.js" \
    "next-env.d.ts"
  do
    if [ -e "$APP_PATH/$path" ] || [ -L "$APP_PATH/$path" ]; then
      rm -rf "$APP_PATH/$path"
    fi

    if [ -e "$STAGING_DIR/$path" ] || [ -L "$STAGING_DIR/$path" ]; then
      mv "$STAGING_DIR/$path" "$APP_PATH/$path"
    fi
  done
}

signal_restart() {
  if [ -f "$APP_PATH/tmp/restart.txt" ]; then
    touch "$APP_PATH/tmp/restart.txt"
    log "Restart signal sent via tmp/restart.txt"
  else
    log "tmp/restart.txt not found. Restart from Hostinger hPanel if needed."
  fi
}

trap cleanup EXIT INT TERM

log "Bootstrapping shell environment..."
load_profile_if_exists "$HOME/.profile"
load_profile_if_exists "$HOME/.bash_profile"
load_profile_if_exists "$HOME/.bashrc"
load_profile_if_exists "$HOME/.zshrc"

log "App path: $APP_PATH"
mkdir -p "$APP_PATH"
cd "$APP_PATH"

acquire_lock
validate_runtime
validate_archive

log "Extracting release archive to staging: $STAGING_DIR"
mkdir -p "$STAGING_DIR"
tar -xzf "$DEPLOY_ARCHIVE" -C "$STAGING_DIR"
validate_staging_layout

publish_staging_to_app_root
rm -f "$DEPLOY_ARCHIVE"

signal_restart
log "Deployment complete."
