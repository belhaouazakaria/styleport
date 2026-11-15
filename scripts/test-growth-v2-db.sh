#!/bin/sh
set -eu
: "${GROWTH_V2_TEST_DATABASE_URL:?Explicit disposable database required}"
node -e 'const u=new URL(process.env.GROWTH_V2_TEST_DATABASE_URL); if(u.hostname!=="127.0.0.1"||u.port!=="55439"||u.pathname!=="/saytwist_growth_v2_test"||u.searchParams.has("host")) throw Error("Unsafe V2 database")'
DATABASE_URL="$GROWTH_V2_TEST_DATABASE_URL" node node_modules/prisma/build/index.js migrate reset --force --skip-seed
DATABASE_URL="$GROWTH_V2_TEST_DATABASE_URL" RUN_GROWTH_V2_DB_TESTS=1 npx vitest run tests/growth-unified-approvals.integration.test.ts tests/growth-discord-security.test.ts tests/growth-viral-confidence.test.ts tests/growth-v2-runtime.test.ts tests/growth-v2-inventory.test.ts tests/growth-v2-recovery-path.test.ts tests/growth-v2-release.test.ts tests/growth-source-analytics-fairness.test.ts tests/growth-native-learning.test.ts tests/growth-google-analytics.test.ts --maxWorkers=2
