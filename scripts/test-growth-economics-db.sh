#!/bin/sh
set -eu
: "${GROWTH_ECONOMICS_TEST_DATABASE_URL:?GROWTH_ECONOMICS_TEST_DATABASE_URL is required}"
node -e 'const u=new URL(process.env.GROWTH_ECONOMICS_TEST_DATABASE_URL);const ok=["localhost","127.0.0.1","::1"].includes(u.hostname)&&decodeURIComponent(u.pathname.slice(1))==="saytwist_growth_phase13_economics_test";if(!ok)throw new Error("Refusing to touch non-disposable Phase 13 DB");'
DATABASE_URL="$GROWTH_ECONOMICS_TEST_DATABASE_URL" node node_modules/prisma/build/index.js migrate reset --force --skip-seed
DATABASE_URL="$GROWTH_ECONOMICS_TEST_DATABASE_URL" RUN_GROWTH_ECONOMICS_DB_TESTS=1 npx vitest run tests/growth-economics-persistence.integration.test.ts
