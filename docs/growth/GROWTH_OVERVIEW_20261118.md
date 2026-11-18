# Growth overview — November 18, 2026

Implemented locally; no production deployment or schema change performed.

The main `/admin/growth` page now includes:

- Today's account rotation, approved native/source allocations and daily ceiling.
  Posted Pins count toward their scheduled UTC day's allocation. Pending reviews,
  channel allocation and spacing can push a new recommendation to a later day.
- A ledger of native and source Pins scheduled today or actually posted today,
  including earlier times, confirmed posted outcomes, failures, retries, uncertain
  outcomes and cancellations. Account/status filters and display timezone selection
  (Algeria, UTC, New York) do not change stored schedules or UTC quota boundaries.
- Fourteen completed UTC days of account impressions and outbound clicks, latest
  seven-day recorded totals, daily coverage and account/Pin analytics timestamps.
  Only READY account observations are charted. Missing/processing days are null,
  break chart lines and are listed in an accessible daily-values table. Absolute
  week-on-week changes require both complete seven-day periods, including a valid
  zero baseline; incomplete periods never imply growth or a fabricated zero.
- Up to twelve leading Pins across production accounts, including source-linked
  Pins regardless of ordinary owned-destination analytics eligibility. Ranking uses
  READY daily metrics with known impressions/clicks over seven completed UTC dates.
  The shortlist is selected by clicks, then impressions; its display can be sorted
  by either metric. Each row shows coverage and outbound rate. Changes require
  seven READY rows in each comparable period. This is a recorded-performance
  ranking, not a statistically qualified viral-winner decision.
- Review backlog, unapproved READY creatives, unresolved delivery incidents, the
  latest blocked preparation in the past day, and the next ten approved schedules.
  Scheduled KPI uses independent exact counts, not the length of that shortlist.

`lib/growth/overview.ts` selects only the dashboard fields and returns serializable
values. Opening this page performs database reads only: no provider request, sync,
AI spend, job mutation, approval, scheduling change or publication. The existing
admin authorization runs before either overview reader. Queries bound schedules,
daily observations and ranked Pins; the ledger discloses when its bound is reached.

## Read-only production qualification

A temporary reader outside deployed application files executed the new queries
against production and was removed afterward. Recorded November 18 results:
Main rotation, native allocation 3/3, source allocation 1/2, one confirmed posted
Pin, three later approved Pins and six upcoming approved publications overall.
All three accounts had five READY days in the latest seven completed days;
comparisons were correctly withheld. Twelve ranked Pins included multiple accounts.
This validates query compatibility and selected data, not production UI deployment.

The previously approved native schedule was 02:00, 14:00 and 18:00 UTC
(03:00, 15:00 and 19:00 Algeria time). Three new Main drafts cannot additionally
fit under today's existing native allocation. No cap or prior approval was changed.

Automated coverage includes UTC boundaries, missing/processing metrics, zero
baselines, complete-period comparisons, publication outcomes, cross-account/source
ranking, exact upcoming counts, account/status filters, timezone and chart metric
controls, line gaps and authorization before reads.

## Validation and preview

Fourteen focused checks across overview data/UI, admin authorization and the
previous queue repair passed. Changed-file ESLint and repository TypeScript
checking passed. The read-only live-data preview was visually verified at desktop
and 390px mobile width, including account filtering and metric switching. The
mobile document width matched its viewport; tables scroll within their sections.
The standalone preview uses a plain anchor in place of Next Link and fallback
fonts; the actual page retains the existing app fonts and routing.

The default production build could not complete: sandboxed Google Font requests
initially failed, then Turbopack's PostCSS worker could not bind its local port
with `Operation not permitted` even on the network-enabled retry. A supported
`--webpack` fallback reached an existing client-bundle import failure:
`node:crypto` → `lib/utils.ts` → `components/providers/toast-provider.tsx`.
Neither file was modified by this work. No build success or production deployment
is claimed; normal production release gates remain required.
