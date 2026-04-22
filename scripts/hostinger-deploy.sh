#!/usr/bin/env sh
set -eu

APP_PATH="${HOSTINGER_APP_PATH:-$(pwd)}"
DEPLOY_ARCHIVE="${HOSTINGER_DEPLOY_ARCHIVE:-$APP_PATH/release.tar.gz}"
LOCK_DIR="$APP_PATH/.deploy-lock"
RELEASE_ID="$(date +%Y%m%d%H%M%S)"
STAGING_DIR="$APP_PATH/.deploy-stage-$RELEASE_ID"
NODE_BIN="${NODE_BIN:-}"
NPM_BIN="${NPM_BIN:-}"

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

prepend_path_if_dir_exists() {
  dir_path="$1"
  if [ -d "$dir_path" ]; then
    PATH="$dir_path:$PATH"
    export PATH
  fi
}

bootstrap_runtime_path_candidates() {
  prepend_path_if_dir_exists "/usr/local/bin"
  prepend_path_if_dir_exists "/usr/bin"
  prepend_path_if_dir_exists "/bin"
  prepend_path_if_dir_exists "$HOME/bin"
  prepend_path_if_dir_exists "$HOME/.local/bin"
  prepend_path_if_dir_exists "$HOME/.npm-global/bin"

  for dir_path in /opt/alt/alt-nodejs*/root/usr/bin /opt/nodejs*/bin; do
    if [ -d "$dir_path" ]; then
      prepend_path_if_dir_exists "$dir_path"
    fi
  done
}

print_runtime_diagnostics() {
  log "Diagnostics:"
  log "shell=${SHELL:-unknown}"
  log "user=$(whoami 2>/dev/null || echo unknown)"
  log "pwd=$(pwd 2>/dev/null || echo unknown)"
  log "PATH=$PATH"
  log "command -v node => $(command -v node 2>/dev/null || echo not-found)"
  log "command -v npm  => $(command -v npm 2>/dev/null || echo not-found)"

  if ls -d /opt/alt/alt-nodejs* >/dev/null 2>&1; then
    log "Found /opt/alt/alt-nodejs* directories:"
    ls -d /opt/alt/alt-nodejs* 2>/dev/null || true
  else
    log "No /opt/alt/alt-nodejs* directories found."
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

detect_best_node_bin() {
  best_bin=""
  best_score=0

  for candidate in \
    "$NODE_BIN" \
    "$(command -v node 2>/dev/null || true)" \
    /opt/alt/alt-nodejs*/root/usr/bin/node \
    /opt/nodejs*/bin/node \
    /usr/local/bin/node \
    /usr/bin/node \
    /bin/node \
    "$HOME/bin/node" \
    "$HOME/.local/bin/node"
  do
    [ -n "$candidate" ] || continue
    [ -x "$candidate" ] || continue

    version_raw="$("$candidate" -v 2>/dev/null || true)"
    version="${version_raw#v}"
    major="${version%%.*}"
    rest="${version#*.}"
    if [ "$rest" = "$version" ]; then
      continue
    fi
    minor="${rest%%.*}"
    rest_patch="${rest#*.}"
    if [ "$rest_patch" = "$rest" ]; then
      patch=0
    else
      patch="$rest_patch"
    fi

    case "$major:$minor:$patch" in
      ''|*[!0-9:]*)
        continue
        ;;
    esac

    score=$((major * 1000000 + minor * 1000 + patch))
    if [ "$score" -gt "$best_score" ]; then
      best_score="$score"
      best_bin="$candidate"
    fi
  done

  if [ -n "$best_bin" ]; then
    NODE_BIN="$best_bin"
    export NODE_BIN
    NODE_DIR="$(dirname "$best_bin")"
    prepend_path_if_dir_exists "$NODE_DIR"
  fi
}

detect_npm_bin() {
  if [ -n "$NPM_BIN" ] && [ -x "$NPM_BIN" ]; then
    NPM_DIR="$(dirname "$NPM_BIN")"
    prepend_path_if_dir_exists "$NPM_DIR"
  fi

  if command -v npm >/dev/null 2>&1; then
    NPM_BIN="$(command -v npm)"
    export NPM_BIN
    return
  fi

  if [ -n "$NODE_BIN" ]; then
    node_dir="$(dirname "$NODE_BIN")"
    if [ -x "$node_dir/npm" ]; then
      NPM_BIN="$node_dir/npm"
      export NPM_BIN
      prepend_path_if_dir_exists "$node_dir"
      return
    fi
  fi
}

validate_runtime() {
  detect_best_node_bin
  detect_npm_bin

  if [ -z "${NODE_BIN:-}" ] || ! command -v node >/dev/null 2>&1; then
    print_runtime_diagnostics
    fail "Node.js was not found in this non-interactive SSH session PATH after bootstrap and fallback detection."
  fi

  if [ -z "${NPM_BIN:-}" ] || ! command -v npm >/dev/null 2>&1; then
    print_runtime_diagnostics
    fail "npm was not found in this non-interactive SSH session PATH after bootstrap and fallback detection."
  fi

  log "Using node: $(command -v node)"
  log "Using npm: $(command -v npm)"
  node --version || true
  npm --version || true
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
bootstrap_runtime_path_candidates

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
