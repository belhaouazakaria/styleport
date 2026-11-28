# Daily briefing and Google analytics (2026-11-22)

## What changed and why

- Reports used to cover "yesterday" and were frozen at 05:05 UTC. Pinterest publishes a day's metrics as PROCESSING the next morning and READY the morning after, so every archived report showed 0/3 accounts READY. `dueGrowthReportDate` now returns the last day with final data (three days back since late Nov 2026, when Pinterest began taking a third morning to finalize).
- The Discord message is built live from the database by `lib/growth/reporting/briefing.ts` (not from the frozen archive) and includes GA4, Search Console and Pinterest figures with day-over-day and 7-day comparisons. Missing data shows as unavailable, never as zero.
- GA4 and Search Console are read through a dedicated read-only service account (`saytwist-analytics-reader`, GA4 Viewer, Search Console Restricted). Its key lives at `/home/saytwist/.config/saytwist-google-reader.json` (mode 600).
- `workers/google-analytics-collector.ts` runs from the `saytwist` user's crontab (04:40 UTC) through `/home/saytwist/bin/saytwist-google-collector.sh`. It does not touch the release-pinned Growth timers or root-owned env files. Use `--backfill` for a 28-day backfill.
- The site sends a GA4 `translation_completed` event (slug, mode, direction, coarse length bucket; never text). Mark it as a key event in GA4.
- Attribution collection stays OFF on purpose. The locked-down Growth launchers refuse to run when it is enabled, and the deploy gate requires it disabled. GA4 provides sessions, Pinterest referral sessions and translations without it.

## Rotating the Google key

Create a new key for `saytwist-analytics-reader` in Google Cloud (project what-type-of-translator), replace the file above (mode 600), then delete the old key in the console.
