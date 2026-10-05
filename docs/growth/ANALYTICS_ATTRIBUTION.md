# Analytics and Attribution Specification

## 1. Objective

Measure the full path from Pinterest exposure to meaningful SayTwist usage.

Do not stop measurement at outbound clicks.

## 2. Funnel

`Pinterest impression -> Pin engagement -> outbound click -> SayTwist landing session -> translator interaction -> completed translation -> deeper site usage`

The first production optimization target is completed translation attributable to Pinterest.

## 3. Pin attribution

Every Growth-managed destination URL should include stable attribution parameters.

Example conceptual scheme:

- `utm_source=pinterest`
- `utm_medium=organic`
- `utm_campaign=<account-or-cluster>`
- `utm_content=<pin-candidate-or-publication-id>`
- `pin_ref=<opaque-internal-reference>`

Do not expose sensitive internal identifiers.

Avoid link shorteners unless there is a legitimate, policy-compliant reason.

## 4. First-party events

Minimum first-party event set:

- `pinterest_landing`
- `translator_view`
- `translator_input_started`
- `translation_completed`
- `idea_view`
- `idea_translator_cta_clicked`
- `embedded_translation_completed`
- `related_content_clicked`

Event design must respect privacy requirements and avoid collecting unnecessary personally identifiable data.

## 5. Attribution window

The initial attribution model should support:

- direct/session attribution;
- configurable return window;
- first-touch and last-touch fields where feasible.

Initial proposal: seven days from last qualified Pinterest landing, configurable and versioned as `pinterest_organic_v1`; confirm during Phase 5 with live data and privacy review.

Historical events must record attribution-model version so future changes do not silently rewrite past interpretation.

## 6. Core dimensions

Analyze by:

- Pinterest account/publication;
- board;
- Pin;
- topic/content cluster;
- destination URL/type;
- translator;
- Ideas page;
- creative archetype;
- renderer/template version;
- headline pattern;
- CTA pattern;
- weekday/time;
- publish age;
- experiment;
- agent decision.

## 7. KPI definitions

### Qualified Pinterest Conversions

Count of Pinterest-attributed sessions producing at least one successful translation.

### Qualified Conversion Rate

`qualified conversions / Pinterest landing sessions`

### Outbound Click Efficiency

Pinterest outbound clicks relative to impressions, when API exposes both.

### Landing Conversion Efficiency

Qualified conversions relative to outbound clicks/landing sessions.

### AI Cost per Qualified Conversion

`Growth AI spend / qualified Pinterest conversions`

This is directional; cost attribution should support job/content granularity where possible.

## 8. Interpretation examples

High impressions + low outbound CTR:
- creative/message mismatch;
- weak CTA;
- broad reach without intent.

High outbound clicks + low SayTwist conversion:
- Pin promise/destination mismatch;
- landing experience problem;
- poor translator relevance;
- accidental/clickbait curiosity.

Lower outbound clicks + high conversion:
- potentially valuable high-intent creative;
- candidate for more distribution/testing.

High saves + delayed conversion:
- inspiration content may have longer intent cycle;
- avoid judging solely on same-day clicks.

## 9. Snapshot model

Pinterest analytics should be persisted as dated snapshots rather than only overwriting current totals.

This allows:

- velocity calculations;
- trend detection;
- cohorting by publish age;
- fatigue analysis;
- before/after comparisons;
- historical reporting.

## 10. Experiment analysis

Every experiment must define:

- hypothesis;
- variant dimension;
- primary KPI;
- guardrail metrics;
- minimum sample/observation window;
- result;
- confidence/decision.

Do not let the agent call winners on tiny samples.

## 11. Data quality

Dashboard should surface:

- last Pinterest sync;
- last conversion-event ingest;
- missing metrics;
- broken attribution;
- duplicate events;
- API lag;
- stale data.

The agent should lower confidence or choose `WAIT_FOR_MORE_DATA` when data quality is poor.

## Phase 5 event and identity contract

`utm_source=pinterest`, `utm_medium=organic` and opaque stable `pin_ref` identify Growth-managed Pins; validate the ref against an issued candidate/publication. A landing event starts a first-party session; translator view, input started, Ideas view, Ideas CTA and embedded completion identify funnel steps. A successful completion is server-authoritative: link a trusted SUCCESS `TranslationLog` or server completion ID. Existing logs record success globally but no UTM, referrer or session, and log writes are currently nonblocking; report missing joins as measurement gaps. Keep both first and last eligible Pinterest touches; primary assignment uses last touch. One session counts once for QPC, even with multiple successful translations. Use unique event/completion keys, filter bots/prefetch and invalid refs, and do not store translation text in attribution rows. Session detail retention proposal: 30 days; event detail: 90 days; preserve aggregates and model version. Respect applicable consent/privacy requirements before launch.

## Phase 4 measurement boundary

Phase 4 persists Pinterest-reported daily organic account and Pin counts only: impressions, saves, Pin clicks, outbound clicks, plus account engagements. Outbound click rate is derived from counts. A Pinterest outbound click is not labeled a SayTwist visit, session, translation, or qualified conversion. No UTM capture, cookie, `pin_ref`, event, or TranslationLog join is implemented before Phase 5. Daily Pinterest history is retained without automatic purging; raw API payloads are not stored.
