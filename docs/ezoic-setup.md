# Ezoic setup

## Current state

Ezoic is not enabled in application code. The official Ezoic Setup MCP was used to review the Next.js App Router integration for `saytwist.com`, but the required dashboard prerequisites and site-specific Ads.txt Manager URL are not yet available in this repository.

Do not add Ezoic bootstrap, CMP, analytics, or placement scripts until the domain is present in the Ezoic account, Google MCM account and domain approval are complete, and Ezoic confirms how the scripts should be limited to public routes. Ezoic's documented Next.js setup places `beforeInteractive` CMP scripts in the root layout; its guidance does not establish support for that strategy in the nested public route-group layout. The root layout also serves `/admin`, so adding the scripts there would violate SayTwist's public-only requirement.

## ads.txt

The repository currently serves [`public/ads.txt`](../public/ads.txt) directly. It must retain this exact AdSense authorization:

```text
google.com, pub-7927856375186557, DIRECT, f08c47fec0942fa0
```

For a non-WordPress JavaScript integration, Ezoic recommends a permanent redirect from exactly `/ads.txt` at nginx to the site-specific Ads.txt Manager URL shown in the Ezoic dashboard. JavaScript integration does not maintain ads.txt automatically. No redirect is configured yet because the site-specific URL or manager account ID cannot be inferred from the domain or AdSense publisher ID and must not be guessed.

To complete ads.txt setup:

1. In **EzoicAds > Ad Transparency > Ads.txt**, select **JavaScript** and save.
2. Review the imported seller entries and confirm the exact AdSense line above is present.
3. Copy the dashboard-provided Ads.txt Manager redirect URL.
4. Configure nginx with a permanent redirect scoped exactly to `/ads.txt`, before the request reaches Node.
5. Use **Verify** in Ezoic and confirm the public URL resolves to the managed seller list containing the AdSense authorization. Dashboard and crawler status can take 24 to 48 hours.

Keep the static file in place until the managed target has been verified. Do not add a Next.js ads.txt route or a second redirect.

## Remaining dashboard and integration work

Before enabling the application integration:

- Complete Google Ad Manager MCM account and domain approval.
- Configure the privacy policy and TCF 2.3 CMP.
- Add an Ezoic excluded-pages directory rule for `/admin/`, or obtain Ezoic-confirmed public-route-only Next.js guidance. The excluded-pages rule makes Ezoic JavaScript terminate on admin pages and omits those visits from its analytics.
- Decide whether to connect the existing AdSense account for optional Ezoic mediation.
- Confirm placement behavior. Ezoic's id-less `ezstandalone.showAds({})` calls do not require placement IDs, but ads do not appear from the header scripts alone.

When those prerequisites are complete, follow the current Ezoic Next.js guide for script order and App Router navigation handling. Avoid duplicate CMP or bootstrap scripts and keep the integration out of admin pages. API route handlers do not render layouts.

## Disable or roll back

For a future JavaScript integration, remove the two privacy scripts, `sa.min.js`, the `ezstandalone` queue setup, `analytics.js`, and all placement calls together, then clear caches and verify public pages. Removing only one part can leave an incomplete integration. Remove the nginx `/ads.txt` redirect only after restoring and verifying a directly served seller list that still contains the required AdSense authorization.
