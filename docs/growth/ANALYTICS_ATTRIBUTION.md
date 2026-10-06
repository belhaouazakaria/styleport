# Analytics and Attribution Specification

## 1. Objective

Measure the full path from Pinterest exposure to meaningful SayTwist usage.

Do not stop measurement at outbound clicks.

## 2. Funnel

`Pinterest impression -> Pin engagement -> outbound click -> SayTwist landing session -> translator interaction -> completed translation -> deeper site usage`

The first production optimization target is completed translation attributable to Pinterest.

## 3. Pin attribution

Every Growth-managed destination URL uses the centralized Phase 5 builder and an issued stable attribution ref.

Example conceptual scheme:

- `utm_source=pinterest`
- `utm_medium=organic`
- `utm_campaign=<controlled-campaign-key>`
- `utm_content=<controlled-content/ref-key>`
- `pin_ref=<opaque-internal-reference>`

`pin_ref` is a cryptographically random URL-safe value from `GrowthAttributionRef`; it exposes no Prisma or Pinterest ID. The builder uses the canonical current SayTwist origin, rejects unsafe/cross-origin destinations, preserves only intended destination parameters, and produces deterministic output for the same ref. Existing Pins without `pin_ref` are not deterministically attributable; Phase 4 metrics remain available, but Phase 5 does not guess from UTM or Referer.

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

Event design must respect privacy requirements and avoid collecting unnecessary personally identifiable data.

## 5. Attribution window

Implemented model `pinterest_organic_v1` supports:

- direct/session attribution;
- configurable return window;
- first-touch and last-touch fields where feasible.

The window is seven days from the latest qualified Pinterest landing and is configurable from 1–30 days. A new qualified landing restarts the window. A direct return inside the active window remains attributable; a translation after expiry does not count until another qualified landing occurs.

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

`utm_source=pinterest`, `utm_medium=organic` and an active issued opaque `pin_ref` identify Growth-managed traffic. The destination path and controlled campaign/content keys must match the ref. A qualified landing creates or updates a first-party session, preserves its first touch, updates its latest touch, and refreshes the seven-day window. Primary assignment uses the latest eligible touch when the first qualified conversion occurs, then freezes it. One session counts once for QPC; additional trusted successes are secondary attributed usage. Translation completion is server-authoritative and requires the exact persisted SUCCESS `TranslationLog`; the client never submits a log ID.

The raw random session token exists only in an HttpOnly, SameSite=Lax, Path=/ cookie that is Secure in production. Its Max-Age follows the attribution window, seven days by default; the separate 30-day session-detail retention does not extend browser identity. PostgreSQL stores only the token's SHA-256 hash. A qualified landing inside the active window refreshes both cookie expiry and `attributionExpiresAt`. A qualified landing after expiry creates a new token/session while the old detail remains until retention cleanup. Public landing/client-event routes require JSON, strict bounded schemas, same-origin requests, both collection gates, an active ref/session, rate limiting, and bot/prefetch filtering. Translator view is once per page interaction, and input started is once after meaningful input. Ideas event enum values exist for Phase 9 compatibility but are not wired in Phase 5.

Session detail defaults to 30 days and event detail to 90 days. A bounded idempotent `ATTRIBUTION_RETENTION_CLEANUP` job deletes expired detail without cascading event history prematurely or deleting long-lived daily aggregate counts. The landing-session KPI counts each newly established qualified attribution session once, even if that session records several qualified landing events; QCR is QPC divided by these unique landing sessions. Aggregates preserve qualified landing sessions, attributed successful translations and QPC by ref/Pin and translator. Attribution tables never store input/output text, raw IP, IP hash, raw user agent, email, authentication identity, or arbitrary event JSON.

Collection is enabled only when `GROWTH_ATTRIBUTION_COLLECTION_ENABLED=true` and `GrowthSettings.attributionEnabled=true`. Both default false; production keeps the environment gate false pending explicit privacy/consent rollout approval. Disabled collection creates no session, event or cookie and cannot affect normal translator use.

## Phase 4 measurement boundary

Phase 4 persists Pinterest-reported daily organic account and Pin counts only: impressions, saves, Pin clicks, outbound clicks, plus account engagements. Outbound click rate is derived from counts. A Pinterest outbound click is not labeled a SayTwist visit, session, translation, or qualified conversion. No UTM capture, cookie, `pin_ref`, event, or TranslationLog join is implemented before Phase 5. Daily Pinterest history is retained without automatic purging; raw API payloads are not stored.

Account totals cover the complete connected Pinterest account, including unrelated historical Pins. Detailed Pin history and the default ranking are limited to active inventory rows whose parsed destination hostname exactly matches the configured current or legacy owned domains. This eligibility filter is operational request scoping, not Phase 5 attribution and not proof that an outbound click became a SayTwist visit or conversion. Existing metrics remain stored when a Pin becomes ineligible.
