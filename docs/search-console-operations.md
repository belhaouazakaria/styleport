# Search Console and crawlability operations

SayTwist uses Google Search Console and `https://saytwist.com/sitemap.xml` for search discovery and monitoring. It has no Google Indexing API integration and no automatic URL-submission service. Google makes the final indexing decision.

## Eligibility states and release gate

Translator metadata, sitemap generation, and the admin translator report use `lib/indexing-eligibility.ts`.

The three states are intentionally separate:

- `deployedBaselineIndexable` reproduces the currently deployed sitemap behavior: an active, non-archived translator with a non-empty slug. Deployed page metadata is narrower and already emits `noindex` unless editorial status is `READY`.
- `newVersionIndexable` is this undeployed branch's proposed unified sitemap and metadata behavior: the deployed baseline plus technically complete published editorial content.
- `strictReviewIndexable` is a future-only comparison requiring exact current-payload human review and the stronger editorial-quality checks. It is not enabled.

Moving from the deployed sitemap rule to the proposed rule can remove URLs from the sitemap even when their robots metadata was already `noindex`. That production URL set must be measured before release approval. Do not infer production impact from local database counts, automatically index thin content, or mass-apply `noindex`.

Run the exact report against a database credential that is independently restricted to production reads:

```bash
DATABASE_URL="$READ_ONLY_PRODUCTION_DATABASE_URL" \
SEO_IMPACT_ENVIRONMENT=production \
SEO_IMPACT_DEPLOYED_VERSION=<actual-deployed-release> \
SEO_IMPACT_BASE_URL=https://saytwist.com \
npm run --silent seo:report-indexing-impact > indexing-impact.json
```

The script also starts a PostgreSQL transaction and sets it to `READ ONLY` before querying. Its JSON contains totals for all three states, exact deployed-to-new losses and gains, additional strict-review losses, stable reason codes, reason aggregates, and explicit sitemap/robots change booleans. Review the complete JSON and record an approval decision before deploying. The release is blocked until then. Do not enable strict enforcement, delete content, edit editorial records, or make a bulk `noindex` change from aggregate counts alone.

## Read-only production verification

```bash
SEO_VERIFY_DEPLOYED_VERSION=<actual-deployed-release> npm run --silent seo:verify-production
```

To check another environment:

```bash
SEO_VERIFY_ENVIRONMENT=preview \
SEO_VERIFY_DEPLOYED_VERSION=<immutable-preview-deployment-id> \
SEO_VERIFY_BASE_URL=https://preview.example.com \
npm run --silent seo:verify-production
```

The command reads only public HTTP responses. It requires an operator-supplied deployed version and states that live responses do not prove the local branch is deployed. It checks robots and sitemap status, sitemap XML shape, canonical hostname, duplicate/query URLs, every exact sitemap URL's status, canonical, and robots directive, a known-missing URL's 404 response, and production host redirects. HTTP, DNS-resolution, network, and SEO-signal failures are distinct machine-readable failure types and produce a nonzero exit. It does not submit URLs or modify content.

Useful direct checks:

```bash
curl -fsS https://saytwist.com/robots.txt
curl -fsS https://saytwist.com/sitemap.xml
curl -sSI https://www.saytwist.com/
curl -sSI https://translator.whattypeof.com/seo-redirect-check
curl -sSI https://translators.whattypeof.com/seo-redirect-check
curl -sSI https://saytwist.com/translators/__saytwist-seo-missing__
```

On 2026-10-12, `translator.whattypeof.com` resolved and returned the expected 308, while `translators.whattypeof.com` failed DNS resolution. The application redirect rule for both hostnames remains preserved, but an application rule cannot redirect a hostname that does not resolve to the service.

## Submit the sitemap

1. Open Google Search Console and select the verified `https://saytwist.com` URL-prefix property or the verified `saytwist.com` domain property.
2. Open **Indexing → Sitemaps**.
3. Enter `sitemap.xml`, which resolves to `https://saytwist.com/sitemap.xml`.
4. Select **Submit**.
5. Confirm Search Console reports a successful fetch, then monitor discovered URL counts and processing errors. A successful fetch does not guarantee indexing.

## URL Inspection checks

Inspect representative URLs from each public type: the homepage, an eligible translator, a published Idea when one exists, and a deliberately missing URL.

For each real page:

1. Paste the exact canonical URL into **URL Inspection**.
2. Run **Test live URL**.
3. Confirm the live fetch succeeds, crawling is allowed, indexing is allowed, and the user-declared canonical is the same production URL.
4. Check rendered HTML and structured data where present.
5. Use **Request indexing** only for a small number of representative pages after a meaningful change. Do not treat it as a bulk submission system.
6. Recheck later for Google's selected canonical, coverage reason, last crawl, and enhancements.

For the missing URL, confirm it returns a real HTTP 404 rather than a soft-404 page. Search/filter/category and pagination variants should canonicalize to their stable directory and emit `noindex,follow` so they do not create duplicate indexed pages.
