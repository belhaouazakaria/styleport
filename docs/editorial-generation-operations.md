# Editorial generation operations

The editorial worker is a separate PM2 process. It reads persistent jobs from PostgreSQL and writes review-only drafts; it never publishes directly.

## Production deploy

From the application directory:

```bash
npm ci
npx prisma migrate deploy
npx prisma generate
npm run build
pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save
```

Required worker settings:

```bash
TRANSLATOR_EDITORIAL_CONCURRENCY=3
TRANSLATOR_EDITORIAL_RETRY_BASE_MS=1500
```

The worker is named `saytwist-editorial-worker`; the web process remains `saytwist`.

## First production batch

1. Deploy the migration and restart both PM2 processes.
2. Open Admin → Translators and choose either **All active translators** or **Incomplete active translators**.
3. Select the page, then choose **Select all N matching**.
4. Choose **Generate missing content**.
5. Confirm the exact count. The request only creates a persistent job; it does not call the provider in the HTTP request.
6. Monitor Admin → Translators → Editorial jobs. Pause or cancel if needed.
7. Review drafts under Admin → Translators → Review queue. Approve first, then publish separately.

Never combine generation and publishing. The first batch should be started manually after confirming the count and worker logs; this repository does not start a generation job automatically.

For a local controlled worker smoke run, use a test database and:

```bash
npm run start:editorial-worker -- --once
```

Do not run that command against production unless a job has been intentionally created and the resulting work is expected.
