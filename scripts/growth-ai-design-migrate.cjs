/* eslint-disable @typescript-eslint/no-require-imports -- root-only Node CommonJS operator entrypoint */
/* Copy root:root 0700 outside the application before use. This command never
 * deploys, restores timers or changes limits. Exact production approval only. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const APP = '/home/saytwist/htdocs/saytwist.com';
const NODE = '/home/saytwist/.nvm/versions/node/v24.20.0/bin/node';
const OLD = '0d258182723fef52201fb995347d8fd845fea7c0';
const MIGRATION = '20261115200000_growth_review_choices';
const names = 'lease-watchdog daily-observe autonomous-cycle approved-publisher daily-fresh private-report autonomous-content daily-account-analytics auto-translator-publish viral-discovery viral-source pin-maintenance v2-courier v2-intelligence'.split(' ');
(async () => {
  const [sha, source] = process.argv.slice(2);
  if (process.getuid() !== 0 || !/^[a-f0-9]{40}$/.test(sha || '') || !source?.startsWith('/root/') || fs.realpathSync(source) !== source ||
      process.env.GROWTH_AI_DESIGN_MIGRATION_APPROVAL !== 'APPLY growth-ai-design-20261115:' + sha ||
      fs.readFileSync(path.join(source, '.release-sha'), 'utf8').trim() !== sha ||
      fs.readFileSync(APP + '/.deployed-release', 'utf8').trim() !== OLD) throw Error('EXACT_RELEASE_APPROVAL_REQUIRED');
  const state = JSON.parse(fs.readFileSync('/etc/saytwist-growth-ai-design-release-state.json', 'utf8'));
  if (state.status !== 'HELD' || state.old !== OLD || state.new !== sha) throw Error('TIMERS_NOT_HELD');
  for (const n of names) {
    const unit = 'saytwist-growth-' + n;
    if (execFileSync('systemctl', ['show', '-P', 'UnitFileState', unit + '.timer'], { encoding: 'utf8' }).trim() !== 'disabled' ||
        execFileSync('systemctl', ['show', '-P', 'ActiveState', unit + '.timer'], { encoding: 'utf8' }).trim() !== 'inactive' ||
        !['inactive', 'failed'].includes(execFileSync('systemctl', ['show', '-P', 'ActiveState', unit + '.service'], { encoding: 'utf8' }).trim())) throw Error('TIMERS_NOT_HELD');
  }
  const listing = execFileSync('/usr/sbin/runuser', ['-u', 'saytwist', '--', 'env', 'HOME=/home/saytwist', 'PM2_HOME=/home/saytwist/.pm2', 'PATH=/home/saytwist/.nvm/versions/node/v24.20.0/bin:/usr/bin:/bin', NODE, '/home/saytwist/.npm/_npx/5f7878ce38f1eb13/node_modules/pm2/bin/pm2', 'jlist'], { encoding: 'utf8' });
  const databaseUrl = require(APP + '/workers/growth-lease-watchdog-launch.cjs').validatedDatabaseUrl(listing);
  const { PrismaClient } = require(APP + '/node_modules/@prisma/client');
  const db = new PrismaClient({ datasourceUrl: databaseUrl });
  fs.mkdirSync(APP + "/.deploy-lock");
  try {
    const rows = await db.$queryRawUnsafe('SELECT migration_name,checksum,finished_at,rolled_back_at FROM "_prisma_migrations"');
    if (rows.some(r => !r.finished_at && !r.rolled_back_at)) throw Error('UNFINISHED_MIGRATION');
    const applied = rows.filter(r => r.finished_at && !r.rolled_back_at);
    if (applied.length !== 40) throw Error('MIGRATION_BASELINE');
    for (const r of applied) {
      const bytes = fs.readFileSync(path.join(source, 'prisma/migrations', r.migration_name, 'migration.sql'));
      if (crypto.createHash('sha256').update(bytes).digest('hex') !== r.checksum) throw Error('MIGRATION_HISTORY_CHANGED');
    }
    const pending = fs.readdirSync(path.join(source, 'prisma/migrations'), { withFileTypes: true }).filter(d => d.isDirectory() && !applied.some(r => r.migration_name === d.name)).map(d => d.name);
    if (pending.length !== 1 || pending[0] !== MIGRATION) throw Error('UNREVIEWED_MIGRATION');
    const log = fs.openSync(path.join(path.dirname(source), 'design-production-migrate.log'), 'wx', 0o600);
    try {
      execFileSync(NODE, [APP + '/node_modules/prisma/build/index.js', 'migrate', 'deploy', '--schema', source + '/prisma/schema.prisma'], {
        cwd: source, env: { PATH: path.dirname(NODE) + ':/usr/bin:/bin', DATABASE_URL: databaseUrl, NODE_ENV: 'production' }, stdio: ['ignore', log, log], timeout: 120000,
      });
    } finally { fs.closeSync(log); }
    const after = await db.$queryRawUnsafe('SELECT migration_name,checksum FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL');
    const expected = crypto.createHash('sha256').update(fs.readFileSync(source + '/prisma/migrations/' + MIGRATION + '/migration.sql')).digest('hex');
    if (after.length !== 41 || !after.some(r => r.migration_name === MIGRATION && r.checksum === expected)) throw Error('MIGRATION_VERIFICATION_FAILED');
    console.log('AI_DESIGN_MIGRATIONS=PASSED_40_TO_41');
  } finally { await db.$disconnect(); fs.rmdirSync(APP + "/.deploy-lock"); }
})().catch(() => { console.error('AI_DESIGN_MIGRATIONS=BLOCKED'); process.exitCode = 1; });
