#!/usr/bin/env bash
set -Eeuo pipefail

# Fetch an approved SHA-addressed GitHub Actions artifact from a short-lived
# HTTPS download URL. The GitHub token never leaves the Actions runner.
# This script does not edit application files, restart PM2 or touch the DB.

APP_PATH="${HOSTINGER_APP_PATH:?HOSTINGER_APP_PATH is required}"
RELEASE_SHA="${HOSTINGER_RELEASE_SHA:?HOSTINGER_RELEASE_SHA is required}"
ARTIFACT_URL="${HOSTINGER_ARTIFACT_URL:?HOSTINGER_ARTIFACT_URL is required}"
ZIP_SHA256="${HOSTINGER_ARTIFACT_ZIP_SHA256:?HOSTINGER_ARTIFACT_ZIP_SHA256 is required}"

[[ "$APP_PATH" == /home/saytwist/htdocs/saytwist.com ]] || {
  echo "Unexpected SayTwist application path." >&2
  exit 1
}
[[ "$RELEASE_SHA" =~ ^[0-9a-f]{40}$ ]] || {
  echo "Invalid expected release SHA." >&2
  exit 1
}
[[ "$ZIP_SHA256" =~ ^[0-9a-f]{64}$ ]] || {
  echo "Invalid GitHub artifact SHA-256 digest." >&2
  exit 1
}
[[ "$ARTIFACT_URL" == https://* ]] || {
  echo "Artifact download must use HTTPS." >&2
  exit 1
}

cd "$APP_PATH"
[[ ! -e .deploy-lock ]] || {
  echo "A guarded deployment already holds the deployment lock." >&2
  exit 1
}
[[ ! -e release.tar.gz ]] || {
  echo "Refusing to replace an existing release.tar.gz archive." >&2
  exit 1
}

command -v curl >/dev/null
command -v python3 >/dev/null
command -v tar >/dev/null

umask 077
zip_tmp="$(mktemp "$APP_PATH/.github-release-zip.XXXXXXXX")"
tar_tmp="$(mktemp "$APP_PATH/.github-release-tar.XXXXXXXX")"
cleanup() {
  rm -f -- "$zip_tmp" "$tar_tmp"
}
trap cleanup EXIT

echo "Fetching verified release artifact directly from GitHub to the VPS."
curl --fail --silent --show-error --location \
  --connect-timeout 20 --max-time 1200 \
  --retry 1 --retry-delay 2 \
  --output "$zip_tmp" "$ARTIFACT_URL"

python3 ./scripts/hostinger-unpack-artifact.py \
  --artifact-zip "$zip_tmp" \
  --destination "$tar_tmp" \
  --expected-zip-sha256 "$ZIP_SHA256" \
  --release-sha "$RELEASE_SHA"

tar -tzf "$tar_tmp" >/dev/null
mv -- "$tar_tmp" "$APP_PATH/release.tar.gz"
echo "Verified release.tar.gz is ready for the existing guarded deployment script."
