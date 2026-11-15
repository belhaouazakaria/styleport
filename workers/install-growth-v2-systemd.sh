#!/usr/bin/env bash
# Creates disabled units only. No activation, credentials, migrations or release.
set -Eeuo pipefail
[[ "$(id -u)" = 0 ]] || { echo 'Root required for unit installation' >&2; exit 1; }
[[ -f "$0" && ! -L "$0" && "$(stat -c '%u:%g:%a' "$0")" == 0:0:700 ]] || exit 1
[[ "${EXPECTED_RELEASE:-}" =~ ^[a-f0-9]{40}$ ]] || exit 1
[[ "${GROWTH_V2_INSTALL_APPROVAL:-}" == "INSTALL_DISABLED_V2:${EXPECTED_RELEASE}" ]] || exit 1
app=/home/saytwist/htdocs/saytwist.com
[[ "$(cat "$app/.deployed-release")" == "$EXPECTED_RELEASE" ]] || exit 1
for mode in courier intelligence; do
  [[ ! -e "/etc/systemd/system/saytwist-growth-v2-${mode}.service" && ! -e "/etc/systemd/system/saytwist-growth-v2-${mode}.timer" ]] || exit 1
done
for mode in courier intelligence; do
  unit="saytwist-growth-v2-${mode}"
  [[ ! -e "/etc/systemd/system/${unit}.service" && ! -e "/etc/systemd/system/${unit}.timer" ]] || exit 1
  cat > "/etc/systemd/system/${unit}.service" <<EOF_UNIT
[Unit]
Description=SayTwist V2 ${mode} (explicitly enabled after acceptance)
After=network-online.target
[Service]
Type=oneshot
User=saytwist
Group=saytwist
WorkingDirectory=$app
Environment=EXPECTED_RELEASE=$EXPECTED_RELEASE
Environment=GROWTH_V2_SERVICE_MODE=$mode
EnvironmentFile=/etc/saytwist/growth-v2-${mode}.env
ExecStart=/home/saytwist/.nvm/versions/node/v24.20.0/bin/node $app/workers/growth-v2-launch.cjs
TimeoutStartSec=140
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=/home/saytwist/htdocs/saytwist.com/storage
EOF_UNIT
  if [[ "$mode" == courier ]]; then cadence=60; else cadence=3600; fi
  cat > "/etc/systemd/system/${unit}.timer" <<EOF_UNIT
[Unit]
Description=SayTwist V2 ${mode} cadence (installed disabled)
[Timer]
OnBootSec=180
OnUnitInactiveSec=$cadence
Persistent=true
[Install]
WantedBy=timers.target
EOF_UNIT
  chmod 0644 "/etc/systemd/system/${unit}.service" "/etc/systemd/system/${unit}.timer"
done
systemctl daemon-reload
printf '%s\n' 'V2_UNITS_INSTALLED_DISABLED=true'
