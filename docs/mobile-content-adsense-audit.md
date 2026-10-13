# Mobile UX, content quality, and AdSense audit

Audit date: 2026-10-12  
Scope: public SayTwist application, repository configuration, and the local development database only. No production database was queried or changed.

## Executive summary

The strongest confirmed product issue is the mobile translator sequence. The input and an empty result card are rendered before the only visible primary action, while a fixed mobile navigation and an optional fixed ad can occupy the same bottom edge. This creates unnecessary scrolling and makes the core action easy to miss.

The strongest confirmed content-quality issue is that active translator pages can be publicly available while having no editorial content. The local catalog contains four active translators; all four are structurally `INCOMPLETE`, three have short descriptions under 80 characters, and none has editorial content. The local database predates the Ideas migration, so live Ideas inventory and quality could not be verified from local data.

AdSense's “Low-value content” message does not identify a page or one technical cause. The working hypothesis is therefore site-wide: thin active translator pages, structural rather than human editorial readiness, limited local content inventory, and ad placement competing with the main mobile experience can collectively reduce perceived value. Approval cannot be guaranteed by these changes.

## Verified findings

| Priority | Area | Confirmed issue | Impact | Implementation decision |
| --- | --- | --- | --- | --- |
| P0 | Mobile translator | The DOM sequence is input, empty result, secondary actions, then a mobile-only sticky primary CTA. | The main task is harder to understand and requires avoidable scrolling. | Render input, primary CTA, then result on mobile. Hide the empty result until loading, error, or success. |
| P0 | Mobile viewport | The global mobile bottom navigation is fixed at `bottom: 0`; the translator CTA is sticky above it; a mobile ad may also be fixed at `bottom: 0`. | Controls can compete for space, obscure content, and behave poorly with the software keyboard/safe area. | Remove the fixed bottom navigation, keep the drawer, use in-flow translator actions, and make mobile ads non-fixed. |
| P0 | Translator content | Local data has 4 active translators; 4 are `INCOMPLETE`, 4 have no editorial record, and 3 descriptions are under 80 characters. | Active pages can be functionally useful but provide little standalone context or differentiation. | Keep pages accessible, retain current `noindex` behavior for incomplete pages, and add an exact content-quality report for editorial work. |
| P1 | Editorial readiness | `READY` is computed from field counts, minimum lengths, and exact-string uniqueness. It does not require evidence of human review, translator-specific language, limitations, or semantic originality. | Long or templated generated copy can be treated as indexable without a reliable editorial checkpoint. | A shared contract now compares the current published payload with the latest reviewed/published draft. Strict enforcement is held until the production URL-level impact report is approved. |
| P1 | Ads | The homepage can render multiple desktop placements before the translator catalog, and the mobile placement is fixed. | Ads may be disproportionately prominent when the page inventory is thin and can interfere with mobile navigation. | Preserve AdSense integration but make the mobile placement in-flow and keep content ahead of secondary placements. Do not add ads. |
| P1 | Ideas | Public queries require published, unarchived Ideas with a current version, and invalid block payloads are not rendered. The local database does not contain the `GrowthIdea` table. | Code-level publication gating is present, but live inventory, originality, and completeness are unverified. | Add content-quality guidance and require manual review; do not invent or bulk-publish articles. |
| P1 | ads.txt | `public/ads.txt` directly serves one Google seller line; no Ezoic redirect exists. | Ezoic's managed inventory is not served at the required URL. | Add an exact `/ads.txt` 301 in `next.config.ts`, remove the conflicting static file, and add regression tests. |
| P2 | Navigation/discovery | Search and categories are usable, but the fixed mobile navigation duplicates drawer destinations and consumes viewport space. Translator cards have good 44px+ actions but generous vertical padding. | One-handed browsing is less efficient, especially at 320–390px. | Retain the accessible drawer, tighten mobile hero/catalog spacing, and make cards more compact without changing the brand. |
| P2 | Related content/comments | Related translators use horizontal snap cards with a 17rem minimum; comments are responsive and retain moderation/privacy messaging. | Related cards are tight at 320px and can feel like overflow even though the scroller is intentional. | Reduce mobile card width and preserve the carousel, comment API, moderation, and deletion behavior. |
| P2 | Trust/SEO | About, Contact, Privacy, Terms, Disclaimer, Cookies, canonical metadata, robots, and sitemap routes exist. Translator metadata already noindexes pages unless editorial readiness is `READY`. | Trust foundations are present. The limitation and AI-provider disclosures should remain prominent and current. | Preserve routes and canonical behavior; clarify the human-review/indexing rules in operations documentation. |

## Confirmed strengths to preserve

- Public translator pages already include About, what-it-does, examples, best uses, instructions, tips, differences, FAQs, related translators, and moderated comments when data exists.
- Translator pages use canonical URLs; metadata and sitemap now use the same eligibility result. Search, category-filter, and pagination parameter pages are `noindex,follow`.
- The sitemap limits translator entries to indexable records and Ideas to published records.
- Robots excludes admin, APIs, verification, login, and temporary generated assets.
- Translation validation, quota/error responses, modes, reverse direction, examples, speech, copy, clear, regeneration, and Pinterest sharing are already implemented.
- Trust pages disclose AI processing, limitations, privacy, acceptable use, and a real contact channel.

## Hypotheses requiring production evidence

- The production catalog may contain more thin or repetitive translators than the four records in the local database.
- Some production pages marked structurally ready may contain templated or AI-generic copy despite passing minimum lengths.
- Production Ideas may be sparse, incomplete, repetitive, or absent; local data cannot establish this.
- Ad density and content-to-ad balance depend on active production placement records and cannot be fully established from source.
- Search Console coverage, AdSense crawler observations, engagement, and actual indexed URLs may identify narrower causes.

Before any bulk indexation change, export the exact production URL set with readiness signals, human-review evidence, and proposed action. This audit intentionally applies no mass `noindex`, deletion, publication, or database change.

## Follow-up implementation record

- The Google Indexing API request code, automatic CRUD submissions, manual/bulk admin routes, admin controls, credentials, environment variables, and setup instructions were removed. Historical Prisma enums, the `IndexingLog` table, its relation, migration, and existing records were preserved.
- `lib/indexing-eligibility.ts` is the single translator contract used by public metadata, sitemap selection, and admin reporting. It exposes both the safe current result and strict current-version-review result.
- `npm run seo:report-indexing-impact` is read-only and produces the exact URL list that strict review enforcement would remove for the connected database.
- `npm run seo:verify-production` is read-only and validates robots, sitemap XML, origin, duplicates, query parameters, live statuses, canonicals, and `noindex` conflicts.
- Result Pinterest sharing is popup-safe: preparation happens on the first click; the second user gesture opens Pinterest. The source snapshot is stored when translation succeeds, so later input edits cannot be combined with an older result.

## Implementation boundaries

- No production database access or mutation.
- No Pinterest publishing or Growth job changes.
- No rewarded ads, offerwalls, new placements, Ezoic JavaScript, or copied seller list.
- No claim that these changes guarantee AdSense approval.
