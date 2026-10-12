# AdSense readiness and editorial action report

Updated: 2026-10-12

This report records verified repository and local-data findings. It does not guarantee Google AdSense approval, and it does not claim the rejection identifies a specific URL or defect.

## Readiness position

SayTwist has a useful interactive product, clear public trust pages, canonical metadata, editorial page sections, moderated comments, and an Ideas system with publication gates. The local content inventory is not ready for an AdSense resubmission: all four active local translators are editorially incomplete, three have descriptions under 80 characters, and the local database cannot verify Ideas because it is missing the Growth Ideas migration.

The most credible root-cause hypothesis remains site-wide perceived value rather than one policy switch: thin active translator pages, limited demonstrated standalone editorial value, structural completeness being confused with human review, and previously intrusive mobile UI/ad positioning can reinforce a low-value assessment.

## Verified issues and implemented fixes

| Finding                                                                                         | Evidence                                                                                             | Fix/status                                                                                                                                                          |
| ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mobile translated-result panel appeared before the only visible primary CTA.                    | Verified in `TranslatorCard` DOM and source.                                                         | Fixed: mobile order is input, primary CTA, then conditional result.                                                                                                 |
| Empty mobile result consumed space before any translation.                                      | Verified in rendered production build.                                                               | Fixed: hidden until loading or a result exists. Validation errors render directly below the CTA.                                                                    |
| Fixed mobile navigation and optional fixed ad could compete with the keyboard and CTA.          | Verified in source.                                                                                  | Fixed: bottom navigation removed; mobile ad is in-flow with safe-area padding; translator CTA is in-flow.                                                           |
| Result actions were not prioritized for the mobile completion task.                             | Verified in source.                                                                                  | Fixed: Copy/Speak remain in the result header; Try Again and Edit Input are the first mobile result actions; sharing remains available below.                       |
| Every successful translation generated and uploaded a Pinterest result image in the background. | Verified in the client component and test diagnostics.                                               | Fixed: the first Share result click prepares the image; only a separate Continue to Pinterest click opens Pinterest synchronously.                                   |
| Active local translators have thin editorial coverage.                                          | Local DB: 4 active, 4 `INCOMPLETE`, 4 without editorial content, 3 descriptions under 80 characters. | Not auto-filled. Exact pages are listed below for human work.                                                                                                       |
| Structural readiness did not establish human review or useful specificity.                      | `getEditorialReadiness` only checked counts, lengths, and exact duplicates.                          | Added a second quality assessment for context-rich examples, limitations, practical depth, generic filler, repeated openings, and human-review evidence.            |
| Google Indexing API was wired to CRUD activation plus manual/bulk admin submissions.             | Verified in data functions, admin routes/UI, credentials, and environment examples.                  | Removed completely. Search Console and the XML sitemap are the only discovery/monitoring mechanisms. Historical log schema and records remain intact.               |
| Sitemap included active translators even when page metadata said `noindex`.                      | Verified in `getIndexableTranslatorSlugsForSitemap`.                                                 | Fixed: metadata, sitemap, and admin reporting now consume one eligibility contract.                                                                                 |
| Existing mobile ad placement was fixed at the viewport bottom.                                  | Verified in homepage source.                                                                         | Fixed: placement remains available but is now in normal content flow. No ads were added or removed.                                                                 |
| Ezoic managed ads.txt was not configured.                                                       | `public/ads.txt` directly served one Google line.                                                    | Fixed in app: exact `/ads.txt` HTTP 301 to AdsTxtManager; static conflict removed. Account-side AdSense seller inventory remains unresolved.                        |

## Exact mobile translation behavior

At widths below 768px:

1. The user sees the source label, copy control, text input, examples when enabled, direction/clear utilities, and character count.
2. The full-width **Twist my words** button appears immediately after the input card. It is not fixed and does not cover the software keyboard or text.
3. Before translation, the result card is hidden. Empty-input and API errors appear below the primary action with alert semantics.
4. During translation, the CTA displays a spinner and loading message while relevant controls are disabled.
5. On success, the result card becomes visible, scrolls into view, and receives programmatic focus. Reduced-motion users receive an immediate, non-animated move.
6. Result controls are ordered around the next likely tasks: Copy and Speak, then Try Again and Edit Input, followed by Pinterest result/translator sharing.
7. Edit Input returns focus to the source textarea. Reverse, modes, examples, clear, keyboard shortcut, speech, copy, regeneration, sharing, validation, quota, and API error behavior remain available.

Desktop keeps the established side-by-side input/result layout and action group.

## Content requiring human editorial work

The local review queue is exact and small:

- `https://saytwist.com/translators/boardroom-brief`
- `https://saytwist.com/translators/comedy-bender`
- `https://saytwist.com/translators/linkedin-style-translator`
- `https://saytwist.com/translators/regal-rewrite`

Each needs a human editor to verify and publish:

- a translator-specific About explanation and concrete description of what changes;
- what distinguishes the style from generic rewriting;
- at least three realistic best uses, usage steps, and practical tips;
- at least three context-labeled before/after examples that preserve facts and intent;
- useful FAQs that address real choices, not keyword variants;
- limitations and situations where the style is inappropriate or needs specialist review;
- natural wording without repeated templates or generic AI filler.

The production catalog must be exported and assessed separately. Local counts must not be treated as production counts.

## Ideas assessment

The code only exposes published, unarchived Ideas with a current version, active category, valid structured blocks, and a published version timestamp. Quality validation rejects placeholders, unsafe markup, unsupported claims, duplicate items/paragraphs, keyword stuffing, thin content, CTA-heavy content, invalid translator references, and numeric-title mismatches.

Remaining concern: the Growth Ideas worker can publish validated generated content, and local data cannot verify the quality or human-review history of live Ideas. Before resubmission, export every production Idea URL with title, category, author kind, human editor identity (if any), publication date, word/item counts, quality diagnostics, and current blocks. A human should confirm standalone usefulness and originality. Do not create or publish filler Ideas merely to increase the count.

## Indexable versus non-indexable assessment

Current safe-rollout behavior:

- Translator page metadata and sitemap inclusion both require an active, non-archived, non-empty slug and structurally complete editorial content.
- The shared contract separately records whether the latest reviewed/published draft exactly matches the current published editorial payload.
- Enforcing that current-version review as a hard indexing requirement is intentionally held pending an exact production database report. The read-only `npm run seo:report-indexing-impact` command prints every URL that would lose eligibility.
- Search, category-filter, and page-2+ parameter pages are `noindex,follow` and canonicalize to their stable directory route.
- Public Ideas require published state and a current published version.
- Trust pages and the Ideas directory are indexable static routes.
The strict reviewed-version switch remains deliberately unapplied. The local read-only report found 4 active translators, 0 currently eligible, 0 strict-current-review eligible, and therefore 0 additional local URLs that would lose eligibility. This is not a production impact report. Production database access was not used, so approval remains blocked until the same command is run against a read-only production connection and its URL-level output is reviewed.

The live read-only HTTP verification on 2026-10-12 found 363 sitemap URLs (8 static, 355 translators, 0 Ideas), HTTP 200 for robots and sitemap, and no status/canonical/noindex errors among sitemap entries. The `www` host returns the expected 301, the singular legacy `translator.whattypeof.com` host returns the expected 308, and missing translator pages return 404. The plural legacy `translators.whattypeof.com` host did not resolve in DNS; its redirect rule remains preserved in source, but DNS must be restored if that hostname still needs to redirect. These observations describe the currently deployed site, not this undeployed branch.

No translators, Ideas, comments, or other user content were deleted. No bulk `noindex` was applied.

## Prioritized action plan

1. Complete and human-review the four local/production-priority translator pages with distinct examples and honest limitations.
2. Export the production translator and Ideas URL inventory. Record exact quality/indexation decisions per URL before changing the sitemap.
3. Review the Ezoic managed file and add/verify the existing AdSense seller authorization before deployment sign-off.
4. Validate production content-to-ad balance after editorial improvements; keep ads after meaningful content and avoid viewport-obstructing placements.
5. Review Search Console indexing/coverage, canonical selection, crawl errors, and top landing pages; fix broken/inaccessible public content.
6. Re-run mobile, accessibility, metadata, sitemap, ads.txt, and trust-page checks in production.
7. Resubmit to AdSense only after representative public pages contain reviewed standalone value. Approval remains Google's decision.

## Checks required before AdSense resubmission

- Every indexable translator has recorded human review and passes the stronger quality assessment.
- Every indexable Idea is useful without requiring a translator click and has been manually reviewed.
- Sitemap, canonical, and robots signals agree for every submitted URL.
- Search/category query parameters do not create indexable duplicates.
- No broken internal links, blank Ideas, empty sections, or inaccessible content exist.
- Mobile input, CTA, loading/error/result, copy, retry, edit, speech, and share paths work on a real device and software keyboard.
- Ads do not precede or obscure the main task and are proportionate to original content.
- About, Contact, Privacy, Terms, Disclaimer, and Cookies remain accessible and accurate.
- Production `/ads.txt` returns the exact 301 and the managed content contains all expected seller authorizations.

## Remaining risks and blockers

- Production content was not queried or changed, so strict current-review enforcement remains blocked on the production URL-level impact report.
- Local Ideas inventory is unavailable because the local DB lacks the Growth Ideas migration.
- The managed Ezoic file currently omits `google.com, pub-7927856375186557, DIRECT, f08c47fec0942fa0`.
- Repository-wide baseline QA failures are tracked separately from feature regressions; see the final QA record after the full rerun.
- A real mobile software keyboard and successful live AI response were unavailable during local browser QA. The in-flow layout, focus, error state, and successful-result component behavior were tested separately.

## QA record

- Responsive production-build checks: 320, 360, 375, 390, 430, 768, 1024, and 1440px; no document-level horizontal overflow.
- Mobile rendered checks: input focus, in-flow CTA, hidden empty result, visible API error, drawer focus/Escape/body-scroll restoration, categories, search, cards, related cards, and absence of site-owned fixed bottom controls.
- Desktop rendered check at 1440px: navigation, hero, search, categories, featured discovery, and translator two-column layout.
- TypeScript: pass after regenerating Next route types.
- Production build: pass. Existing warnings cover Edge runtime deprecation, dynamic filesystem tracing, and a missing local `GrowthIdea` table during sitemap generation; sitemap gracefully continued.
- Focused regressions: pass for indexing eligibility, sitemap/robots, translator card/Pinterest flow, and ads.txt.
- Full Vitest: 359 passed, 142 skipped, 1 failed in the pre-existing Growth Ideas handler payload fixture.
- Full ESLint: 8 errors and 5 warnings. The error-bearing files and failing Growth Ideas test/handler have byte-identical Git blob hashes to latest `origin/main`; changed-file ESLint passes.
- Production SEO verifier: pass against all 363 live sitemap URLs; robots and sitemap returned 200, with no duplicates, query URLs, status failures, canonical mismatches, or sitemap/noindex conflicts. A deliberately missing translator returned 404; `www` returned 301 to the canonical host; both legacy domains returned 308 while preserving the path.
- Visual QA limitation: live translation returned the existing generic API error locally, so successful-result visual state relied on passing component tests rather than a live model response.
