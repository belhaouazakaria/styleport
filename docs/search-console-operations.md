# Search Console and crawlability operations

SayTwist uses Google Search Console and `https://saytwist.com/sitemap.xml` for search discovery and monitoring. It has no Google Indexing API integration and no automatic URL-submission service. Google makes the final indexing decision.

## Eligibility contract

Translator metadata, sitemap generation, and the admin translator report use `lib/indexing-eligibility.ts`.

The safe rollout currently requires:

- an active, non-archived translator;
- a non-empty public slug;
- technically complete published editorial content.

The contract also computes strict eligibility. Strict eligibility requires the latest human-reviewed, published editorial draft payload to exactly match the current published editorial payload and to pass the stronger editorial-quality checks. A historical reviewed draft does not qualify after the live editorial content changes.

Strict review enforcement is held until an exact production report is reviewed and approved. Run this against a read-only production connection:

```bash
npm run seo:report-indexing-impact > indexing-impact.json
```

Review every entry under `wouldLoseEligibility`. Do not enable strict enforcement, delete content, or make a bulk `noindex` change from aggregate counts alone.

## Read-only production verification

```bash
npm run seo:verify-production
```

To check another environment:

```bash
SEO_VERIFY_BASE_URL=https://preview.example.com npm run seo:verify-production
```

The command reads only public HTTP responses. It checks robots and sitemap status, sitemap XML shape, canonical hostname, duplicate/query URLs, every sitemap URL's status, canonical, and robots directive, a known-missing URL's 404 response, and production host redirects. It does not submit URLs or modify content.

Useful direct checks:

```bash
curl -fsS https://saytwist.com/robots.txt
curl -fsS https://saytwist.com/sitemap.xml
curl -sSI https://www.saytwist.com/
curl -sSI https://translator.whattypeof.com/seo-redirect-check
curl -sSI https://saytwist.com/translators/__saytwist-seo-missing__
```

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
