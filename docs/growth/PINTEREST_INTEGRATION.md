# Pinterest Integration Specification

## 1. Integration rule

Use the official Pinterest API only for Pinterest account actions.

Do not implement:

- browser automation for posting;
- password-based bots;
- hidden account control;
- cookie/session hijacking;
- unofficial follow/comment/message automation;
- anti-spam evasion.

## 2. Developer access

Pinterest API access has not yet been obtained.

Implementation must begin with:

- Pinterest developer application;
- current API documentation verification;
- Trial access testing;
- preparation for Standard access if required for normal production publishing.

Planning baseline from current Pinterest documentation:

- Trial access supports Pin analytics and API exploration.
- Trial-created Pins are visible only to the creator.
- Standard access is required for normal production behavior.

Verify these facts again during the Pinterest integration phase because external platform rules may change.

## 3. Business accounts

Use Pinterest business accounts for Growth publications so analytics/business capabilities are available.

Initial target:

- SayTwist
- SayTwist Ideas
- SayTwist Playground

Each connected account stores:

- Pinterest account ID;
- display metadata;
- editorial role;
- status;
- OAuth/token metadata;
- granted scopes;
- token expiry/refresh state;
- connection health;
- allowed boards;
- publication settings.

Secrets/tokens must be encrypted at rest or stored in an appropriate secret mechanism, never plaintext in admin responses/logs.

## 4. OAuth

Requirements:

- state/CSRF protection;
- redirect URI validation;
- least-privilege scopes;
- encrypted token storage;
- safe refresh handling;
- explicit disconnect/revoke path;
- no token values in logs;
- audit connection/disconnection events.

## 5. Website claim

Planning baseline:

- `saytwist.com` should be claimed by the main SayTwist account.
- Do not create subdomains solely to manufacture account claims.
- Satellite accounts may link to SayTwist content according to Pinterest rules.

Pinterest currently states that a website can only be claimed by one Pinterest account. Verify again before implementation.

## 6. Analytics ingestion

Use official organic analytics endpoints where available.

Desired metrics include, when exposed by the API:

- impressions;
- saves;
- Pin clicks;
- outbound clicks;
- outbound click rate;
- engagement metrics;
- account-level metrics;
- individual Pin metrics;
- top Pin reporting.

Current Pinterest documentation supports organic reporting with a 90-day lookback for user accounts/Pins and lifetime organic reporting for most Pins. Verify current API contracts during implementation.

## 7. Trends

Do not make the system dependent on Pinterest Trends API access.

Use a provider abstraction:

- `InternalPerformanceTrendProvider`
- `PinterestTrendProvider` if access is available
- future external providers if explicitly approved

The internal provider based on actual SayTwist/Pinterest performance is mandatory and sufficient for core operation.

## 8. Publication compliance gate

Current Pinterest developer guidelines state that applications should not enable users to automatically initiate actions without specifically considering each action; for scheduled Pin publishing, the end user must choose each Pin to publish.

Therefore:

1. agent creates a Pin candidate;
2. candidate passes internal quality/policy checks;
3. admin sees the exact candidate;
4. admin specifically approves/selects that Pin;
5. system schedules/publishes that approved Pin at the recommended time.

Approval is per Pin.

Do not silently auto-approve on behalf of the operator.

If Pinterest explicitly grants/introduces a different approved automation mode, change only after policy verification and a documented decision.

## 9. Idempotent publishing

Every approved publication requires:

- internal publication ID;
- account ID;
- candidate Pin ID;
- idempotency key;
- desired publish time;
- attempt count;
- API response identifier;
- final state.

States may include:

- draft
- awaiting_approval
- approved
- scheduled
- publishing
- published
- failed_retryable
- failed_terminal
- rejected
- cancelled

Never create duplicate Pins because of a retry timeout.

## 10. Rate limits

Treat API rate limits as a resource budget.

- centralize Pinterest requests;
- record relevant rate-limit headers where provided;
- use backoff;
- stop retry storms;
- prioritize analytics/publication tasks;
- show degraded state in admin.

## 11. Policy baseline

Pinterest policy currently prohibits:

- unapproved automation;
- inauthentic/mass-created accounts;
- repetitive/deceptive/irrelevant content used to make money;
- multiple accounts operated to manipulate the platform;
- attempts to improperly influence distribution/clicks;
- attempts to evade anti-spam systems.

The Growth system is intentionally designed around authentic publications and distinct content intent.

## 12. External references

Official references to re-check during implementation:

- Pinterest Developer access tiers: https://developers.pinterest.com/docs/key-concepts/access-tiers/
- Pinterest organic reporting: https://developers.pinterest.com/docs/analytics-and-reports/organic-reporting/
- Pinterest developer guidelines: https://policy.pinterest.com/en/developer-guidelines
- Pinterest community guidelines: https://policy.pinterest.com/en-gb/community-guidelines
- Pinterest website claims: https://help.pinterest.com/en/business/article/claim-your-website

## Phase 3 implemented connection boundary

Phase 3 uses Pinterest API v5 Authorization Code OAuth. Production base is `https://api.pinterest.com/v5`; Sandbox is `https://api-sandbox.pinterest.com/v5`; authorization is `https://www.pinterest.com/oauth/`. Routes are `GET /api/admin/growth/pinterest/oauth/start?role=...` and `GET /api/admin/growth/pinterest/oauth/callback`. Requested scopes are exactly `user_accounts:read`, `boards:read`, `pins:read`, `pins:write`.

Required server variables are `PINTEREST_APP_ID`, `PINTEREST_APP_SECRET`, `PINTEREST_REDIRECT_URI`, `PINTEREST_API_ENVIRONMENT` (`sandbox` or `production`) and `GROWTH_CREDENTIAL_ENCRYPTION_KEY` (generate with `openssl rand -base64 32`). The redirect must use `/api/admin/growth/pinterest/oauth/callback` exactly. Missing values show Not configured without breaking ordinary build/tests. Configuration health is calculated server-side from this one required-name list and exposes only configured state, missing variable names and environment; it never serializes secrets or credentials into the admin UI.

State is random 256-bit data; only its SHA-256 hash is stored with admin ID, role, environment and ten-minute expiry, then consumed atomically once. Credentials use AES-256-GCM envelope version 1 with random 12-byte IV, authentication tag and fixed versioned AAD. Access tokens refresh five minutes before expiry. Continuous refresh rotates the refresh token, so both tokens and expiries are replaced atomically under an account row lock.

`GET /user_account` synchronizes identity. `GET /boards?page_size=100` follows bookmarks with ten-page and 1,000-board caps plus loop detection. Only a complete sync upserts and marks unseen boards inactive. Phase 3 never creates, edits or deletes a Pinterest board or Pin. Official documentation exposes no suitable app-driven revoke operation here; local disconnect erases ciphertext, prevents token use, cancels pending sync jobs and retains non-secret history.

`npm run growth:worker` is a one-shot process. Its bootstrap loads Next environment files before importing Growth/Pinterest code: `.env.production.local`, `.env.local`, `.env.production`, then `.env`, while explicitly supplied process environment values retain precedence. Operators do not need to export Pinterest variables manually when production values are in `.env.local`. A local configuration failure is terminal for a claimed sync job and does not enter a retry cycle; deploy the corrected configuration/bootstrap before manually running another worker batch.

Live status: **OAuth connection validated; board synchronization pending worker-fix deployment and controlled rerun**. Standard access is an operator review process and is never inferred from API data.
