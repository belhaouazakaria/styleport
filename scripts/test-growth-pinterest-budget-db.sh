#!/bin/sh
set -eu

: "${GROWTH_PINTEREST_BUDGET_TEST_DATABASE_URL:?Missing explicit disposable PostgreSQL URL}"
node -e '
const raw = process.env.GROWTH_PINTEREST_BUDGET_TEST_DATABASE_URL;
const url = new URL(raw);
if (!["127.0.0.1", "localhost", "::1"].includes(url.hostname) ||
    decodeURIComponent(url.pathname.slice(1)) !== "saytwist_growth_phase14f_budget_test" ||
    process.env.DATABASE_URL !== raw) {
  throw new Error("Refusing Pinterest budget tests against any non-disposable DB");
}
'
DATABASE_URL="$GROWTH_PINTEREST_BUDGET_TEST_DATABASE_URL" node node_modules/prisma/build/index.js migrate reset --force --skip-seed
DATABASE_URL="$GROWTH_PINTEREST_BUDGET_TEST_DATABASE_URL" RUN_GROWTH_PINTEREST_BUDGET_DB_TESTS=1 node node_modules/vitest/vitest.mjs run tests/growth-pinterest-global-budget.persistence.integration.test.ts
