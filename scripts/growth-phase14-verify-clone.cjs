#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
"use strict";

/* Read-only final verification of the Phase14 populated-clone Prisma migration. */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");

const CLONE = "saytwist_phase14_rehearsal_20261030";
const NAME = "20261029220000_growth_worker_activation_expiry";
const BASE = "/home/saytwist/.local/share/saytwist/phase14-rehearsal/";

function run() {
  const sha = process.env.HOSTINGER_RELEASE_SHA || "";
  const root = path.resolve(__dirname, "..");
  if (!/^[a-f0-9]{40}$/.test(sha) || root !== BASE + sha ||
      fs.readFileSync(path.join(root, ".release-sha"), "utf8").trim() !== sha)
    throw new Error("BAD_SOURCE");
  const url = new URL(process.env.DATABASE_URL || "");
  if (!["postgres:", "postgresql:"].includes(url.protocol) ||
      url.hostname !== "127.0.0.1" || url.port !== "5433" ||
      decodeURIComponent(url.pathname.slice(1)) !== "saytwist" ||
      url.searchParams.has("host")) throw new Error("BAD_DATABASE");
  const env = { ...process.env,
    PGHOST: "127.0.0.1", PGPORT: "5433", PGDATABASE: CLONE,
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGCONNECT_TIMEOUT: "5" };
  delete env.DATABASE_URL;
  delete env.PGOPTIONS;
  function sql(q) {
    const p = spawnSync("/usr/lib/postgresql/18/bin/psql",
      ["-X", "-qAt", "-w", "-v", "ON_ERROR_STOP=1",
        "-d", CLONE, "-c", q],
      { env, encoding: "utf8", timeout: 15000, maxBuffer: 1024 * 1024 });
    if (p.error || p.status !== 0) throw new Error("CLONE_QUERY_FAILED");
    return p.stdout.trim();
  }
  const applied = sql("SELECT checksum FROM \"_prisma_migrations\" WHERE migration_name=" +
    "'20261029220000_growth_worker_activation_expiry' AND finished_at IS NOT NULL");
  const bytes = fs.readFileSync(path.join(root, "prisma/migrations", NAME, "migration.sql"));
  const expected = crypto.createHash("sha256").update(bytes).digest("hex");
  if (applied !== expected ||
      sql("SELECT count(*) FROM \"_prisma_migrations\" WHERE finished_at IS NOT NULL") !== "32" ||
      sql("SELECT count(*) FROM information_schema.columns WHERE table_name='GrowthSettings' AND column_name='workerActivationExpiresAt' AND is_nullable='YES'") !== "1" ||
      sql("SELECT (NOT \"enabled\" AND NOT \"attributionEnabled\" AND \"workerActivationExpiresAt\" IS NULL)::int FROM \"GrowthSettings\" WHERE id='global'") !== "1" ||
      sql("SELECT count(*) FROM \"GrowthJob\" WHERE status IN ('PENDING','CLAIMED','RUNNING','FAILED_RETRYABLE')") !== "0") {
    throw new Error("CLONE_NOT_QUALIFIED");
  }
  console.log("PHASE14_POPULATED_CLONE_PRISMA_VERIFIED=true");
}
try { run(); }
catch { console.error("PHASE14_POPULATED_CLONE_PRISMA_VERIFICATION_BLOCKED"); process.exitCode = 1; }
