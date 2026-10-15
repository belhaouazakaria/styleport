#!/bin/sh
set -eu
: "${GROWTH_LEARNING_TEST_DATABASE_URL:?GROWTH_LEARNING_TEST_DATABASE_URL is required}"
node -e 'const u=new URL(process.env.GROWTH_LEARNING_TEST_DATABASE_URL); const ok=["localhost","127.0.0.1","::1"].includes(u.hostname)&&decodeURIComponent(u.pathname.slice(1))==="saytwist_growth_phase12_learning_test"; if(!ok) throw new Error("Phase 12 DB tests refuse every target except loopback saytwist_growth_phase12_learning_test");'
DATABASE_URL="$GROWTH_LEARNING_TEST_DATABASE_URL" node node_modules/prisma/build/index.js migrate reset --force --skip-seed
DATABASE_URL="$GROWTH_LEARNING_TEST_DATABASE_URL" RUN_GROWTH_LEARNING_DB_TESTS=1 npx vitest run tests/growth-learning-persistence.integration.test.ts
