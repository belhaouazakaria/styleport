#!/usr/bin/env bash
set -Eeuo pipefail

fail() { echo "GROWTH_DEPLOY_COORDINATOR_INSTALL=BLOCKED" >&2; exit 1; }
[[ "$(id -u)" == 0 && "$#" == 1 ]] || fail
[[ -f "$0" && ! -L "$0" && "$(stat -c '%u:%g:%a' "$0")" == "0:0:700" ]] || fail
SHA="$1"
[[ "$SHA" =~ ^[a-f0-9]{40}$ ]] || fail
APP=/home/saytwist/htdocs/saytwist.com
SOURCE="$APP/workers/growth-deploy-release-coordinator.py"
TARGET=/usr/local/sbin/saytwist-growth-deploy-coordinator
SUDOERS=/etc/sudoers.d/saytwist-growth-deploy-coordinator
[[ "$(cat "$APP/.deployed-release")" == "$SHA" ]] || fail
[[ -f "$SOURCE" && ! -L "$SOURCE" ]] || fail
[[ ! -e "$TARGET" && ! -L "$TARGET" && ! -e "$SUDOERS" && ! -L "$SUDOERS" ]] || fail

# The deploy account checks that this launcher is executable before asking
# sudo to run it. Its root-only guard prevents unprivileged direct execution.
install -o root -g root -m 0755 "$SOURCE" "$TARGET"
tmp="$(mktemp /etc/sudoers.d/.saytwist-growth-deploy-coordinator.XXXXXXXX)"
cat > "$tmp" <<'EOF'
saytwist ALL=(root) NOPASSWD: /usr/local/sbin/saytwist-growth-deploy-coordinator hold *, /usr/local/sbin/saytwist-growth-deploy-coordinator restore *, /usr/local/sbin/saytwist-growth-deploy-coordinator recover *
EOF
chown root:root "$tmp"
chmod 0440 "$tmp"
visudo -cf "$tmp" >/dev/null || { rm -f "$tmp"; fail; }
mv "$tmp" "$SUDOERS"
visudo -cf "$SUDOERS" >/dev/null || fail
echo "GROWTH_DEPLOY_COORDINATOR_INSTALL=INSTALLED"
echo "GROWTH_DEPLOY_COORDINATOR_RELEASE=$SHA"
