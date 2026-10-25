#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
"use strict";

/**
 * Phase 13 production migration guard. PRE-FLIGHT BY DEFAULT.
 * Deliberately standalone for execution from a private source-only bundle;
 * it uses the existing deployed Prisma CLI, never the published release.
 *
 * Production migration is only permitted after a distinct explicit operator
 * authorization, a verified populated clone rehearsal and a new live backup.
 * No provider sends, app deployment, PM2 restart or worker activation here.
 */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync, spawnSync } = require("node:child_process");

const APP_ROOT = "/home/saytwist/htdocs/saytwist.com";
const NODE_DIR = "/home/saytwist/.nvm/versions/node/v24.20.0/bin";
const PRISMA = path.join(APP_ROOT, "node_modules/prisma/build/index.js");
const SOURCE_ROOT = path.resolve(__dirname, "..");
const MIGRATIONS_DIR = path.join(SOURCE_ROOT, "prisma/migrations");
const PG_BIN = "/usr/lib/postgresql/18/bin";
const PROD = "saytwist";
const CLONE = "saytwist_phase13_rehearsal_20261025";
const EXPECTED_HOST = "127.0.0.1";
const EXPECTED_PORT = "5433";
const BASELINE = "20261016120000_growth_analytics_gap_recovery";
const PENDING = [
  "20261018120000_growth_economics_limits",
  "20261024190000_growth_telegram_delivery_default",
  "20261024210000_growth_ai_usage_evidence",
  "20261025150000_growth_daily_report_append_only",
];
const BACKUP_ROOT = "/home/saytwist/.local/share/saytwist/phase13-backups";
const LOCK = path.join(APP_ROOT, ".deploy-lock");
const SAFE_ERRORS = new Set([
  "INVALID_ARGUMENTS", "WRONG_OPERATOR_USER", "INVALID_SOURCE_ROOT",
  "RELEASE_SHA_NOT_VERIFIED", "MISSING_REVIEWED_FILES",
  "MIGRATION_INVENTORY_CHANGED", "PM2_NOT_FOUND", "PM2_APP_NOT_FOUND",
  "PRODUCTION_DB_IDENTITY_MISMATCH", "UNSAFE_RUNTIME_FLAGS",
  "PRODUCTION_NOT_AT_BASELINE", "CLONE_NOT_QUALIFIED",
  "MIGRATION_CHECKSUM_MISMATCH", "HEALTH_NOT_OK",
  "DATABASE_QUERY_FAILED", "PRODUCTION_APPROVAL_REQUIRED",
  "RELEASE_LOCK_HELD", "BACKUP_DIRECTORY_UNSAFE",
  "BACKUP_FAILED", "BACKUP_INVALID", "MIGRATION_FAILED",
  "PRODUCTION_POSTCHECK_FAILED",
]);
const fail = code => { throw Error(code); };
const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);

function verifySource() {
  const sha = process.env.GROWTH_PHASE13_RELEASE_SHA || "";
  if (!/^[a-f0-9]{40}$/.test(sha) ||
      path.basename(SOURCE_ROOT) !== sha ||
      SOURCE_ROOT !== "/home/saytwist/.local/share/saytwist/phase13-rehearsal/" + sha) {
    fail("RELEASE_SHA_NOT_VERIFIED");
  }
  if (process.getuid?.() !== fs.statSync(APP_ROOT).uid || process.getuid?.() === 0) {
    fail("WRONG_OPERATOR_USER");
  }
  if (!fs.existsSync(PRISMA) || !fs.existsSync(NODE_DIR + "/node") ||
      !fs.existsSync(MIGRATIONS_DIR) ||
      !fs.existsSync(path.join(SOURCE_ROOT, "prisma/schema.prisma"))) {
    fail("MISSING_REVIEWED_FILES");
  }
  const list = fs.readdirSync(MIGRATIONS_DIR, {withFileTypes:true})
    .filter(x=>x.isDirectory()).map(x=>x.name).sort();
  if (list.length!==31 || list[26]!==BASELINE || !same(list.slice(-4),PENDING)) {
    fail("MIGRATION_INVENTORY_CHANGED");
  }
  for (const name of list) {
    if (!/^[0-9]{14}_[a-z0-9_]+$/.test(name) ||
        !fs.statSync(path.join(MIGRATIONS_DIR,name,"migration.sql")).isFile()) {
      fail("MISSING_REVIEWED_FILES");
    }
  }
  return {sha, names:list};
}

function credentials() {
  const candidates = [
    "/home/saytwist/.npm-global/bin/pm2",
    "/home/saytwist/.local/bin/pm2",
    NODE_DIR + "/pm2",
  ];
  const pm2=candidates.find(fs.existsSync);
  if (!pm2) fail("PM2_NOT_FOUND");
  let apps;
  try {
    apps=JSON.parse(execFileSync(pm2,["jlist"],{
      encoding:"utf8",timeout:15000,maxBuffer:12*1024*1024,
      env:{...process.env,PM2_HOME:"/home/saytwist/.pm2",
        PATH:NODE_DIR+":/usr/local/bin:/usr/bin:/bin"},
    }));
  } catch { fail("PM2_APP_NOT_FOUND"); }
  const app=apps.find(x=>x.name==="saytwist" && x.pm2_env?.status==="online");
  if (!app) fail("PM2_APP_NOT_FOUND");
  const source=app.pm2_env||{};
  for(const key of [
    "TELEGRAM_REPORTS_ENABLED", "GROWTH_DAILY_REPORT_SCHEDULE_ENABLED",
    "GROWTH_ATTRIBUTION_COLLECTION_ENABLED",
  ]) {
    if ((source[key]??source.env?.[key])==="true") fail("UNSAFE_RUNTIME_FLAGS");
  }
  const raw=source.DATABASE_URL??source.env?.DATABASE_URL;
  if(!raw) fail("PRODUCTION_DB_IDENTITY_MISMATCH");
  let u;
  try {u=new URL(raw)} catch {fail("PRODUCTION_DB_IDENTITY_MISMATCH")}
  if (!["postgres:","postgresql:"].includes(u.protocol) ||
      u.hostname!==EXPECTED_HOST || u.port!==EXPECTED_PORT ||
      decodeURIComponent(u.pathname.slice(1))!==PROD ||
      !u.username || !u.password || u.searchParams.has("host")) {
    fail("PRODUCTION_DB_IDENTITY_MISMATCH");
  }
  return u;
}

function pgEnv(url,dbname){
  const env={...process.env,
    PGHOST:EXPECTED_HOST,PGPORT:EXPECTED_PORT,
    PGUSER:decodeURIComponent(url.username),
    PGPASSWORD:decodeURIComponent(url.password),
    PGDATABASE:dbname,
    PGCONNECT_TIMEOUT:"5",
  };
  delete env.DATABASE_URL;
  delete env.PGOPTIONS;
  return env;
}
function pgRun(command,args,env,timeout=30000){
  const proc=spawnSync(PG_BIN+"/"+command,args,{
    encoding:"utf8",env,timeout,maxBuffer:2*1024*1024,
  });
  if(proc.error||proc.status!==0) fail("DATABASE_QUERY_FAILED");
  return proc.stdout.trim();
}
function query(url,dbname,sql) {
  if (![PROD,CLONE].includes(dbname)) fail("DATABASE_QUERY_FAILED");
  return pgRun("psql",["-X","-qAt","-w","-v","ON_ERROR_STOP=1",
    "-d",dbname,"-c",sql],pgEnv(url,dbname));
}
function histories(url,db){
  const data=query(url,db,
    'SELECT "migration_name" || \'|\' || "checksum" FROM "_prisma_migrations" WHERE "finished_at" IS NOT NULL ORDER BY "migration_name"');
  const incomplete=query(url,db,
    'SELECT count(*) FROM "_prisma_migrations" WHERE "finished_at" IS NULL AND "rolled_back_at" IS NULL');
  if(incomplete!=="0") fail(db===PROD?"PRODUCTION_NOT_AT_BASELINE":"CLONE_NOT_QUALIFIED");
  return data?data.split("\n").map(x=>x.split("|")):[];
}
function verifyHashes(records,names) {
  for(let i=0;i<records.length;i++){
    const [name,hash]=records[i];
    if(name!==names[i]||!/^[a-f0-9]{64}$/.test(hash)) fail("MIGRATION_CHECKSUM_MISMATCH");
    const computed=crypto.createHash("sha256")
      .update(fs.readFileSync(path.join(MIGRATIONS_DIR,name,"migration.sql"))).digest("hex");
    if(hash!==computed) fail("MIGRATION_CHECKSUM_MISMATCH");
  }
}
function verifyBaseline(url,names) {
  const live=histories(url,PROD);
  const clone=histories(url,CLONE);
  if(live.length!==27||live[26]?.[0]!==BASELINE) fail("PRODUCTION_NOT_AT_BASELINE");
  if(clone.length!==31||clone[30]?.[0]!==PENDING[3]) fail("CLONE_NOT_QUALIFIED");
  verifyHashes(live,names);
  verifyHashes(clone,names);
  if(!same(clone.slice(0,27),live)) fail("CLONE_NOT_QUALIFIED");
  const owner=query(url,CLONE,"SELECT (pg_get_userbyid(datdba)=current_user)::int FROM pg_database WHERE datname=current_database()");
  if(owner!=="1") fail("CLONE_NOT_QUALIFIED");
  const disabled=query(url,PROD,'SELECT (NOT "enabled" AND NOT "attributionEnabled")::int FROM "GrowthSettings" WHERE id=\'global\'');
  if(disabled!=="1") fail("UNSAFE_RUNTIME_FLAGS");
  return live;
}

function checkHealth(){
  for(const ep of ["healthz","readyz"]){
    const r=spawnSync("/usr/bin/curl",
      ["--fail","--silent","--show-error","--max-time","5",
        "http://127.0.0.1:3001/api/"+ep],
      {encoding:"utf8",timeout:9000,maxBuffer:512*1024});
    if(r.error||r.status!==0) fail("HEALTH_NOT_OK");
  }
}
function backup(url,sha){
  fs.mkdirSync(BACKUP_ROOT,{recursive:true,mode:0o700});
  if ((fs.lstatSync(BACKUP_ROOT).mode&0o077)!==0 ||
      fs.lstatSync(BACKUP_ROOT).isSymbolicLink()) fail("BACKUP_DIRECTORY_UNSAFE");
  const tag=new Date().toISOString().replace(/[-:]/g,"").replace(/\..+/, "Z");
  const file=path.join(BACKUP_ROOT,"pre-phase13-execute-"+tag+"-"+sha.slice(0,12)+".dump");
  const fd=fs.openSync(file,"wx",0o600);
  fs.closeSync(fd);
  const r=spawnSync(PG_BIN+"/pg_dump",
    ["--format=custom","--no-password","--lock-wait-timeout=5s","--file",file],
    {env:pgEnv(url,PROD),timeout:180000,stdio:"ignore"});
  if(r.error||r.status!==0)fail("BACKUP_FAILED");
  const s=fs.lstatSync(file);
  if(!s.isFile()||s.isSymbolicLink()||s.size<4096||(s.mode&0o077)!==0)fail("BACKUP_INVALID");
  const inspect=spawnSync(PG_BIN+"/pg_restore",["--list",file],
    {timeout:30000,stdio:"ignore"});
  if(inspect.error||inspect.status!==0)fail("BACKUP_INVALID");
  console.log("FRESH_PRODUCTION_BACKUP_ARCHIVE_VERIFIED: true");
  console.log("FRESH_BACKUP_LOCATION: "+file);
  console.log("FRESH_BACKUP_SIZE_MIB: "+(s.size/1048576).toFixed(2));
}

function apply(url,sha,names,baseline){
  if(process.env.GROWTH_PHASE13_PRODUCTION_APPROVAL!==
     "APPLY FOUR PHASE13 MIGRATIONS "+sha)fail("PRODUCTION_APPROVAL_REQUIRED");
  let locked=false;
  try{
    fs.mkdirSync(LOCK,{mode:0o700});
    locked=true;
  } catch {fail("RELEASE_LOCK_HELD")}
  try{
    checkHealth();
    if(!same(histories(url,PROD),baseline)) fail("PRODUCTION_NOT_AT_BASELINE");
    backup(url,sha);
    if(!same(histories(url,PROD),baseline)) fail("PRODUCTION_NOT_AT_BASELINE");
    const childEnv={...process.env,DATABASE_URL:url.toString(),
      PATH:NODE_DIR+":"+(process.env.PATH||"")};
    delete childEnv.GROWTH_PHASE13_PRODUCTION_APPROVAL;
    delete childEnv.PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK;
    delete childEnv.DIRECT_URL;
    const r=spawnSync(NODE_DIR+"/node",[
      PRISMA,"migrate","deploy","--schema",path.join(SOURCE_ROOT,"prisma/schema.prisma"),
    ],{cwd:SOURCE_ROOT,env:childEnv,encoding:"utf8",
       timeout:180000,maxBuffer:2*1024*1024});
    if(r.error||r.status!==0)fail("MIGRATION_FAILED");
    const final=histories(url,PROD);
    if(final.length!==31||!same(final.map(x=>x[0]),names)) fail("PRODUCTION_POSTCHECK_FAILED");
    verifyHashes(final,names);
    const tables=query(url,PROD,
      "SELECT ((to_regclass('public.\"GrowthAiBudgetReservation\"') IS NOT NULL)::int) +"+
      " ((to_regclass('public.\"GrowthDailyReport\"') IS NOT NULL)::int) +"+
      " ((to_regclass('public.\"GrowthAiUsageEvent\"') IS NOT NULL)::int) +"+
      " ((to_regclass('public.\"GrowthReportDelivery\"') IS NOT NULL)::int)");
    const triggers=query(url,PROD,
      "SELECT count(*) FROM pg_trigger WHERE tgname IN "+
      "('GrowthAiUsageEvent_append_only','GrowthDailyReport_append_only') "+
      "AND NOT tgisinternal AND tgenabled='O'");
    if(tables!=="4"||triggers!=="2")fail("PRODUCTION_POSTCHECK_FAILED");
    checkHealth();
    console.log("PRODUCTION_MIGRATIONS_APPLIED: 4");
    console.log("PRODUCTION_IMMUTABILITY_TRIGGERS_PRESENT: true");
    console.log("PRODUCTION_HEALTH_PASSED: true");
    console.log("APPLICATION_NOT_DEPLOYED: true");
    console.log("GROWTH_NOT_ENABLED: true");
  }finally{
    if(locked)fs.rmdirSync(LOCK);
  }
}

function main(){
  if(process.argv.length>3||
     !["preflight","apply"].includes(process.argv[2]||"preflight")){
    fail("INVALID_ARGUMENTS");
  }
  const mode=process.argv[2]||"preflight";
  const {sha,names}=verifySource();
  const url=credentials();
  checkHealth();
  const baseline=verifyBaseline(url,names);
  console.log("PRODUCTION_BASELINE_VERIFIED: true");
  console.log("REHEARSAL_CLONE_QUALIFIED: true");
  console.log("PENDING_MIGRATION_COUNT: 4");
  console.log("GROWTH_AND_REPORTING_DISABLED: true");
  console.log("RELEASE_SHA_VERIFIED: true");
  if(mode==="preflight"){
    console.log("READ_ONLY_PREFLIGHT_PASSED: true");
    console.log("PRODUCTION_DATABASE_MODIFIED: false");
    return;
  }
  apply(url,sha,names,baseline);
}

try{main()}catch(error){
  console.error(SAFE_ERRORS.has(error?.message)?
    error.message:"PHASE13_PRODUCTION_MIGRATION_BLOCKED");
  process.exitCode=1;
}
