#!/usr/bin/env sh
set -eu

APP_PATH="${HOSTINGER_APP_PATH:-$(pwd)}"

load_profile_if_exists() {
  profile_path="$1"
  if [ -f "$profile_path" ]; then
    # shellcheck disable=SC1090
    . "$profile_path" >/dev/null 2>&1 || true
  fi
}

detect_runtime_path() {
  for candidate in \
    /usr/local/bin \
    /usr/bin \
    /bin \
    "$HOME/bin" \
    "$HOME/.local/bin" \
    "$HOME/.npm-global/bin" \
    /opt/alt/alt-nodejs*/root/usr/bin \
    /opt/nodejs*/bin
  do
    if [ -d "$candidate" ]; then
      PATH="$candidate:$PATH"
    fi
  done
  export PATH
}

echo "[hostinger] Bootstrapping shell environment..."
load_profile_if_exists "$HOME/.profile"
load_profile_if_exists "$HOME/.bash_profile"
load_profile_if_exists "$HOME/.bashrc"
load_profile_if_exists "$HOME/.zshrc"
detect_runtime_path

echo "[hostinger] App path: $APP_PATH"
cd "$APP_PATH"

if [ ! -f package.json ]; then
  echo "[hostinger] ERROR: package.json not found at $APP_PATH"
  exit 1
fi

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "[hostinger] ERROR: node/npm were not found in this non-interactive SSH session."
  echo "[hostinger] PATH=$PATH"
  echo "[hostinger] node location: $(command -v node 2>/dev/null || echo not-found)"
  echo "[hostinger] npm location: $(command -v npm 2>/dev/null || echo not-found)"
  echo "[hostinger] Ensure Hostinger Node.js is configured for this app and PATH is available to SSH sessions."
  exit 127
fi

echo "[hostinger] Using node: $(command -v node)"
echo "[hostinger] Using npm: $(command -v npm)"
node --version
npm --version

echo "[hostinger] Installing dependencies..."
npm ci --no-audit --no-fund

echo "[hostinger] Validating production environment..."
npm run validate:env:production

echo "[hostinger] Generating Prisma client..."
npm run prisma:generate

echo "[hostinger] Applying production migrations..."
npm run prisma:deploy

echo "[hostinger] Building Next.js app..."
npm run build

if [ -f tmp/restart.txt ]; then
  touch tmp/restart.txt
  echo "[hostinger] Restart signal sent via tmp/restart.txt"
else
  echo "[hostinger] tmp/restart.txt not found. Restart the Node.js app from Hostinger hPanel if needed."
fi

echo "[hostinger] Deployment pipeline complete."
