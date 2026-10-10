#!/bin/sh
set -eu
: "${GROWTH_PUBLISHING_TEST_DATABASE_URL:?GROWTH_PUBLISHING_TEST_DATABASE_URL is required}"
node -e 'const u=new URL(process.env.GROWTH_PUBLISHING_TEST_DATABASE_URL); const ok=["localhost","127.0.0.1","::1"].includes(u.hostname)&&decodeURIComponent(u.pathname.slice(1))==="saytwist_growth_phase11_publishing_test"; if(!ok) throw new Error("Phase 11 DB tests refuse every target except loopback saytwist_growth_phase11_publishing_test");'
DATABASE_URL="$GROWTH_PUBLISHING_TEST_DATABASE_URL" node node_modules/prisma/build/index.js migrate reset --force --skip-seed
DATABASE_URL="$GROWTH_PUBLISHING_TEST_DATABASE_URL" RUN_GROWTH_PUBLISHING_DB_TESTS=1 npx vitest run tests/growth-publishing-persistence.integration.test.ts
