# SayTwist AdSense CSP and head script integration

Date: 2026-11-12. Canonical site: https://saytwist.com.

## Evidence

A browser run at `https://translator.whattypeof.com` loaded AdSense but reported:
- `connect-src` blocked `https://ep1.adtrafficquality.google/getconfig/sodar`.
- `script-src` blocked `https://fundingchoicesmessages.google.com/i/ca-pub-7927856375186557`.
- `connect-src` blocked `https://pagead2.googlesyndication.com/pagead/ping`.
- AdSense logged a `data-nscript` warning from the Next.js `Script` wrapper.

These are code/browser diagnostics, **not** proof of AdSense serving eligibility or guaranteed inventory.

## Patch

- Public content CSP explicitly permits known AdSense script/connect/frame origins. Keep `img-src https:` as previously configured.
- Admin, API and login routes override the general CSP with the original tighter policy, using Next.js documented last-matching-header precedence.
- The exact AdSense bootstrap script is rendered as native `<script async src=... crossorigin="anonymous">` in the server-side head renderer. Other head scripts continue through Next.js `Script`.
- No advertiser redirects, `ads.txt`, canonical tags, DNS, production database, or Growth controls are changed.
- Tests assert exact native script detection, Google Analytics behavior, observed resource domains, and restricted routes.

## Limits and operations

Google AdSense [official CSP guidance](https://support.google.com/adsense/answer/16283098?hl=en) **only supports nonce-based strict CSP** because AdSense resources can change. This host allowlist is a *targeted compatibility fix*, not a permanent Google-supported configuration. A proper nonce-based CSP migration should be separately designed, tested, and deployed. Do not respond to future errors by allowing `https:` globally without reviewing the security implications.

AdSense's approved site is `saytwist.com`. Test that hostname, not just `translator.whattypeof.com`: Google's [site-management guidance](https://support.google.com/adsense/answer/12131223?hl=en) requires the site to be approved in the AdSense Sites inventory. Another domain's host or DNS mapping does not confer approval.

## Post-deployment checks

1. Verify `https://saytwist.com/` HTTP 200, canonical, `ads.txt` direct HTTP 200 and exact line, and application health and readiness.
2. Inspect CSP for homepage and `/admin`; public includes traffic-quality, Funding Choices, and AdSense connect domains, but admin does not.
3. Load `saytwist.com` in Chrome without ad blockers, check Console for CSP violations, filter Network on `ads?` and verify actual ad requests. Google can choose not to fill impressions.
4. Confirm AdSense Sites approval = Ready, no Policy Center issues, Auto ads enabled and applied for `saytwist.com`, and `ads.txt` = Authorized when refreshed.
5. If CSP still blocks new hosts, assess strict nonce CSP instead of accumulating unreviewed host allowances.

Release through the existing reviewed exact-commit production workflow. Do not modify the VPS manually for this change.
