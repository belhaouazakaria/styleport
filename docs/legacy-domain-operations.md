# Legacy translator hostname: parallel hosting readiness (2026-11-11)

**Status:** Source-only review branch. No production deployment, DNS, TLS, or advertising activation is implied.

## Owner intent

Serve both `saytwist.com` (preferred canonical, SEO growth) and
`translator.whattypeof.com` (existing Pinterest backlinks and potential
approved advertising) from the existing SayTwist Next.js app on the same
Hostinger VPS. The primary VPS public address reported by the operator is
`82.112.242.43`. The legacy hostname currently resolves to
`77.37.50.61` and redirects with 308 to SayTwist. Do **not** switch DNS
before the application and virtual host are ready.

## Source behavior

- Removes only the singular `translator.whattypeof.com` permanent host
  redirect. The plural `translators.whattypeof.com` historical alias continues
  to redirect to SayTwist if it is ever pointed to this app.
- Keeps `APP_BASE_URL=https://saytwist.com`, all public canonical metadata,
  sitemap URLs, share URLs and sitemap references on SayTwist. This is
  **duplicate-content canonicalization**, not a promise of independent organic
  rankings for the legacy host.
- Keeps SayTwist's existing Ezoic-managed `/ads.txt` 301 on the
  `saytwist.com` and `www.saytwist.com` hosts only. The legacy host returns
  404 for `/ads.txt` until its **own** exact seller lines are provisioned in
  `LEGACY_TRANSLATOR_ADS_TXT`; then it serves text/plain. No legacy seller
  identifiers are invented.
- Shared sitewide `customHeadCode` and ad placements are blocked on the
  legacy host unless the operator sets
  `LEGACY_TRANSLATOR_ADS_APPROVED=true` **after** checking AdSense Sites
  status, publisher/client IDs, ad tag compatibility, and any Ezoic/site-level
  permissions. This does not itself prove eligibility or payment.
- Public translator interactions use the same Next.js/Prisma app and
  database; this is not a second independent code deployment. The host
  must reach the same PM2 app through the configured NGINX vhost.
- Keep Growh attribution's independent privacy/consent gates OFF.

## Critical release safety

Current production release at authoring:
`fc3ec602b6fbaad4d3afbedca840c3f2c43521c2`.
It has **12 active Growth systemd timers**, including the recently activated
bounded Pinterest Pin maintenance timer. The previous temporary release
coordinator is pinned to 11 timers and old/new SHA values; **do not reuse it
for this release**. Any deployment needs a new reviewed, exact-SHA,
**12-timer** hold/deploy/restore coordinator, root-level preflight, explicit
approval, protected GitHub Actions deployment and read-only post-deploy
verification. No automatic merge-triggered deployment.

## Operator checklist after qualified code release

1. Read-only audit CloudPanel NGINX vhost for `saytwist.com`, app port
   `3001`, the original host header, present TLS names, certificate paths
   and redirect directives. Never overwrite/replace the running SayTwist site.
2. Configure `translator.whattypeof.com` as an alias or equivalent NGINX
   vhost to the **same** Next.js app. Verify HTTP Host routing using
   `curl --resolve` against the new VPS before changing public DNS.
3. Determine the authoritative DNS provider for `whattypeof.com`, and
   preserve all other records (MX, TXT, SPF, DKIM etc). Update **only**
   the singular translator A/AAAA record, using short TTL. Check for a CNAME
   or proxied service before editing; do not create a conflicting A.
4. Obtain a valid TLS certificate including the singular translator hostname
   and verify the live SNI name, no TLS warning, no domain-to-domain redirect
   and correct HTTP 200 on homepage and representative translator pages.
   HTTP-01 issuance can require DNS to point to the VPS and correct NGINX
   vhost challenge routing. Never disable production TLS to make it pass.
5. Confirm `saytwist.com` remains 200, its sitemap/robots/ads.txt and canonical
   URLs unchanged, the old host self-responds but emits **SayTwist canonical**,
   and the plural legacy hostname (if configured) still redirects.
6. Check actual AdSense Sites status for the registrable old domain and
   SayTwist separately. Before enabling legacy ads, verify the right publisher
   ID, `ads.txt` seller lines, script/placement targeting, AdSense policies,
   and no unintended ads on a non-approved site. Configure legacy variables
   privately without printing secrets, restart only under the reviewed
   release process.
7. Recheck the **12 timers**, off-state Growth global switch, no blocking
   jobs, Pinterest shared budget, PM2 health and the next bounded maintenance
   tick. Track Search Console indexed/crawled cohorts separately.

## SEO and monetization constraints

Google may consolidate two identical sites under one canonical, so the old
domain is for retained direct/referral visitors while SayTwist remains the
indexing target. Do not submit the duplicate old host sitemap to Search
Console as a separate canonical URL set. Independently improve translator
content usefulness, crawlability and mobile ad placement before reapplying
for AdSense; ads may not monetize until the specific site is approved.

References:
- Google canonicalization: https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls
- AdSense approval status: https://support.google.com/adsense/answer/12170222
- CloudPanel TLS: https://www.cloudpanel.io/docs/v2/frontend-area/tls/
