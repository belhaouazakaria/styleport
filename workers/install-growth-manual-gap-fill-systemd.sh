#!/usr/bin/env bash
set -Eeuo pipefail

fail() { echo "GROWTH_MANUAL_GAP_FILL_INSTALL=BLOCKED" >&2; exit 1; }
[[ "$(id -u)" == 0 && "$#" == 1 ]] || fail
[[ -f "$0" && ! -L "$0" && "$(stat -c '%u:%g:%a' "$0")" == "0:0:700" ]] || fail
SHA="$1"
[[ "$SHA" =~ ^[a-f0-9]{40}$ ]] || fail

APP=/home/saytwist/htdocs/saytwist.com
AI_ENV=/etc/saytwist-growth-ai.env
UNIT=/etc/systemd/system/saytwist-growth-manual-gap-fill@.service
HELPER=/usr/local/sbin/saytwist-growth-gap-fill
SUDOERS=/etc/sudoers.d/saytwist-growth-gap-fill

[[ "$(cat "$APP/.deployed-release")" == "$SHA" ]] || fail
[[ -f "$APP/workers/growth-manual-gap-fill.ts" ]] || fail
[[ -f "$APP/workers/growth-manual-gap-fill-launch.cjs" ]] || fail
[[ -x /home/saytwist/.nvm/versions/node/v24.20.0/bin/node ]] || fail
[[ -x /home/saytwist/.npm/_npx/5f7878ce38f1eb13/node_modules/pm2/bin/pm2 ]] || fail
[[ -f "$AI_ENV" && ! -L "$AI_ENV" && "$(stat -c '%u:%g:%a' "$AI_ENV")" == "0:0:600" ]] || fail
[[ "$(wc -l < "$AI_ENV")" -eq 2 ]] || fail
grep -Eq '^GROWTH_OPENAI_API_KEY=sk-[A-Za-z0-9_-]{12,}$' "$AI_ENV" || fail
grep -Eq '^GROWTH_OPENAI_PROJECT_ID=proj_[A-Za-z0-9_-]{3,128}$' "$AI_ENV" || fail
if systemctl list-units --type=service --state=active --no-legend 'saytwist-growth-manual-gap-fill@*.service' | grep -q .; then fail; fi

TEMP="$(mktemp -d /etc/.growth-manual-gap-fill.XXXXXXXX)"
trap 'rm -rf "$TEMP"' EXIT

cat > "$TEMP/saytwist-growth-manual-gap-fill@.service" <<EOF
[Unit]
Description=SayTwist owner-requested daily Pin gap fill (%i)
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
User=saytwist
Group=saytwist
WorkingDirectory=$APP
Environment=NODE_ENV=production
Environment=EXPECTED_RELEASE=$SHA
Environment=GROWTH_MANUAL_GAP_FILL_LAUNCH=true
Environment=GROWTH_MANUAL_GAP_FILL_ENABLED=true
Environment=GROWTH_MANUAL_GAP_FILL_REQUEST_ID=%i
EnvironmentFile=$AI_ENV
ExecStart=/home/saytwist/.nvm/versions/node/v24.20.0/bin/node $APP/workers/growth-manual-gap-fill-launch.cjs
TimeoutStartSec=1200
NoNewPrivileges=true
PrivateTmp=true
UMask=0077
EOF

cat > "$TEMP/helper" <<EOF
#!/usr/bin/env bash
set -Eeuo pipefail
[[ "\$#" == 1 ]] || exit 2
[[ "\$(cat $APP/.deployed-release)" == "$SHA" ]] || exit 3
if [[ "\$1" == "--check" ]]; then
  [[ -f "$UNIT" && -f "$AI_ENV" && -f "$SUDOERS" && "\$(stat -c '%u:%g:%a' "$AI_ENV")" == "0:0:600" ]] || exit 4
  grep -q '^GROWTH_OPENAI_API_KEY=sk-' "$AI_ENV" || exit 5
  grep -q '^GROWTH_OPENAI_PROJECT_ID=proj_' "$AI_ENV" || exit 6
  echo GAP_FILL_HELPER_READY
  exit 0
fi
[[ "\$1" =~ ^[0-9a-f-]{36}\$ ]] || exit 2
exec /usr/bin/systemctl start --no-block "saytwist-growth-manual-gap-fill@\$1.service"
EOF

cat > "$TEMP/sudoers" <<EOF
saytwist ALL=(root) NOPASSWD: $HELPER
EOF

chown root:root "$TEMP/saytwist-growth-manual-gap-fill@.service" "$TEMP/helper" "$TEMP/sudoers"
chmod 0644 "$TEMP/saytwist-growth-manual-gap-fill@.service"
chmod 0755 "$TEMP/helper"
chmod 0440 "$TEMP/sudoers"
systemd-analyze verify "$TEMP/saytwist-growth-manual-gap-fill@.service" || fail
visudo -cf "$TEMP/sudoers" >/dev/null || fail
install -o root -g root -m 0644 "$TEMP/saytwist-growth-manual-gap-fill@.service" "$UNIT"
install -o root -g root -m 0755 "$TEMP/helper" "$HELPER"
install -o root -g root -m 0440 "$TEMP/sudoers" "$SUDOERS"
systemctl daemon-reload

[[ "$(systemctl is-enabled saytwist-growth-manual-gap-fill@.service 2>/dev/null || true)" != "enabled" ]] || fail
echo "GROWTH_MANUAL_GAP_FILL_INSTALL=READY_DISABLED_RELEASE_$SHA"
