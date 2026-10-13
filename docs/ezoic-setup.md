# Ezoic setup

## Current state

Ezoic JavaScript is not enabled in application code. Managed ads.txt is configured independently through an exact Next.js redirect; no Ezoic bootstrap, CMP, placement, or analytics scripts are included.

Do not add Ezoic bootstrap, CMP, analytics, or placement scripts until the domain is present in the Ezoic account, Google MCM account and domain approval are complete, and Ezoic confirms how the scripts should be limited to public routes. Ezoic's documented Next.js setup places `beforeInteractive` CMP scripts in the root layout; its guidance does not establish support for that strategy in the nested public route-group layout. The root layout also serves `/admin`, so adding the scripts there would violate SayTwist's public-only requirement.

## Managed ads.txt

`next.config.ts` returns HTTP 301 for exactly `/ads.txt`:

```text
https://srv.adstxtmanager.com/19390/saytwist.com
```

The redirect uses explicit `statusCode: 301`. The former `public/ads.txt` was removed so the static asset cannot intercept the route. Existing old-domain redirects and security headers are unchanged. SayTwist runs through the Next.js request handler in `server.js`, so the redirect is part of the production runtime configuration after a fresh build and process restart.

The Google Indexing API removal does not affect this redirect or Ezoic. Search discovery now uses Search Console and `sitemap.xml`; ads.txt remains a separate advertising authorization concern.

Ezoic's managed endpoint was checked on 2026-10-12. It returned HTTP 200, `text/plain`, `ownerdomain=saytwist.com`, an Ezoic manager declaration, and seller records. The operator confirmed on 2026-10-13 that the existing SayTwist AdSense authorization is now present:

```text
google.com, pub-7927856375186557, DIRECT, f08c47fec0942fa0
```

The account-side seller-authorization blocker is resolved. Do not copy a second seller list into the repository; preserve the managed redirect and recheck the live response during deployment validation.

## Deployment validation

After deploying a build from this branch and restarting the Node process, run:

```bash
curl -sSI https://saytwist.com/ads.txt
curl -fsSL https://saytwist.com/ads.txt
curl -fsSL https://saytwist.com/ads.txt | grep -F \
  'google.com, pub-7927856375186557, DIRECT, f08c47fec0942fa0'
```

The first command must show a `301` response and this exact `Location`:

```text
https://srv.adstxtmanager.com/19390/saytwist.com
```

The second must follow the redirect and return meaningful authorized seller records. The third must succeed during production smoke testing to confirm the operator-approved account state is still being served.

If a CDN or Hostinger proxy serves `/ads.txt` before requests reach Next.js, configure the same exact redirect at that outer layer or remove the conflicting rule. Do not create a redirect at both layers if it produces a loop. Clear caches, repeat the commands above, and verify an unrelated path does not redirect to AdsTxtManager.

To complete account setup:

1. In **EzoicAds > Ad Transparency > Ads.txt**, select **JavaScript** and save.
2. Import or add the existing AdSense authorization and confirm the exact line above is present.
3. Use **Verify** in Ezoic after the application deployment.
4. Run all three validation commands and save their output with the deployment record.

## Remaining dashboard and integration work

Before enabling the application integration:

- Complete Google Ad Manager MCM account and domain approval.
- Configure the privacy policy and TCF 2.3 CMP.
- Add an Ezoic excluded-pages directory rule for `/admin/`, or obtain Ezoic-confirmed public-route-only Next.js guidance. The excluded-pages rule makes Ezoic JavaScript terminate on admin pages and omits those visits from its analytics.
- Decide whether to connect the existing AdSense account for optional Ezoic mediation.
- Confirm placement behavior. Ezoic's id-less `ezstandalone.showAds({})` calls do not require placement IDs, but ads do not appear from the header scripts alone.

When those prerequisites are complete, follow the current Ezoic Next.js guide for script order and App Router navigation handling. Avoid duplicate CMP or bootstrap scripts and keep the integration out of admin pages. API route handlers do not render layouts.

## Disable or roll back

For a future JavaScript integration, remove the two privacy scripts, `sa.min.js`, the `ezstandalone` queue setup, `analytics.js`, and all placement calls together, then clear caches and verify public pages. Removing only one part can leave an incomplete integration. Remove the Next.js `/ads.txt` redirect only after restoring and verifying a directly served seller list that still contains the required AdSense authorization.
