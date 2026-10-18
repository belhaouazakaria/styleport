# OpenWA reporting provider — deployment preparation

**Status:** Adapter and formatter implemented on isolated Phase 13 branch. No daily report archive, recurring scheduler, delivery-state persistence or production WhatsApp session is enabled by this file.

## Product decision

- One operator-recipient daily Growth executive report through self-hosted **OpenWA Easy API v5**.
- Keep existing automatic SayTwist content publication validation and independent Pinterest per-Pin approval.
- OpenWA is **not** the official WhatsApp Business Platform. Meta may restrict unauthorized automation. Do not use bulk sending, unsolicited messaging, account sharing, scraped contacts, or evasion techniques.
- Ungated `sendText` to an **existing chat** requires no OpenWA license under the provider's current docs; contacting a brand-new number may require a paid license. The prospective recipient should message the sending account first.
- WhatsApp submit/message ID is not a delivery/read confirmation. Unknown outcomes stay blocked for manual inspection, never blind retries.
- No monetary OpenWA messaging fee is assumed, but VPS/browser resources and potentially paid features still carry real costs.

## Architecture

`lib/growth/reporting/openwa.ts` implements a local-only, authenticated, opt-in transport. `lib/growth/reporting/digest.ts` formats a compact truthful executive digest. OpenWA itself runs **as a separate, isolated process/container** and retains its browser profile. SayTwist must not install Chromium into the primary Node web process or expose a public API endpoint that controls WhatsApp.

- `OPENWA_REPORTS_ENABLED` = `false` by default, opt in only after operator pairing/test.
- `OPENWA_API_URL` = `http://127.0.0.1:8080` (only the literal IPv4 loopback address is accepted; no proxy, public hostname or arbitrary network target).
- `OPENWA_API_KEY` = separately generated high-entropy secret (minimum 32 characters), stored in server-only environment, never returned to browsers.
- `OPENWA_REPORT_RECIPIENT` = digits in E.164 country-code form with `@c.us`, e.g. `213XXXXXXXXX@c.us`. Exact value only after operator confirmation and an established chat.

OpenWA v5 Easy API request:
```http
POST /api/messages/sendText
Content-Type: application/json
X-API-Key: <server-only secret>

{"to":"213XXXXXXXXX@c.us","content":"SayTwist Growth · ...","options":{}}
```

Readiness requires `GET /health` return both `connected: true` and `session.ready: true`. Health check is **not** a secret-auth test, so also verify an authenticated metadata request during operator setup. Record only a bounded message ID after a confirmed submission.

## VPS preparation (not executed)

Use the official OpenWA v5 installation instructions with a pinned release and persistent browser profile. For an initial proof of concept, run the API in an isolated service bound to `127.0.0.1:8080` (or a container whose published host binding is loopback-only), with all configuration in an owner-readable secrets file, and a persistent protected session directory. Never expose `8080`, `/health`, `/dashboard` or `/api-docs` to the public Internet.

Check host CPU/RAM headroom before adding another always-on Chromium/browser runtime: SayTwist, uRiddle and other services share the VPS. Preserve production session state securely and exclude it from source control/backups available to unauthorized users.

1. Install the **official, pinned** OpenWA v5 runtime in the isolated service.
2. Configure the secrets and session directory, and bind the listener to loopback.
3. Pair the sending WhatsApp account using the QR shown in the **private operator session**. Never publish QR codes or bearer credentials.
4. Have the recipient initiate a regular WhatsApp chat with the sending account (for license-free existing-chat operation).
5. Verify `/health` and a protected metadata endpoint locally. Once ready, authorize **one** explicit test message, then inspect the recipient chat.
6. Only after a durable report archive, once-per-day delivery state, a schedule, fail-closed unknown-outcome handling, and tests are complete may the operator enable `OPENWA_REPORTS_ENABLED=true`.

## Remaining Phase 13/14 work

- Create immutable daily report snapshots from real stored metrics (unknown/unavailable distinct from zero).
- Create delivery archive with `NOT_SENT` / `SENDING` / `SUBMITTED` / `OUTCOME_UNKNOWN` states, strict daily idempotency and operator-only reconciliation.
- Do **not** re-send a report automatically after a network timeout, HTTP error with uncertain disposition or job crash between send and persistence.
- Explicit admin-only queue/preview/test routes, controls and recovery path.
- Phase 14 controlled once/day worker schedule, long-lived WhatsApp session health and disconnection warning, end-to-end single-recipient test, resource/load check, runbook and release approval.
- If OpenWA becomes unavailable or unsafe, retain digest archive for manual inspection and choose an approved alternative through a separate decision. Do not silently send to email or another recipient.

## Primary upstream references

- https://openwa.dev/docs/getting-started/easy-api
- https://openwa.dev/docs/guides/send-message-api
- https://openwa.dev/docs/getting-started/docker
- https://openwa.dev/docs/licensing/licensed-features
- https://www.whatsapp.com/legal/terms-of-service


## Dedicated sender confirmed (2026-10-18)

The operator has a dedicated WhatsApp number for **sending** SayTwist reports. The actual telephone number must be supplied only in the private VPS session/pairing workflow and must not be committed into source control or documented in plain text in this repository. `OPENWA_REPORT_RECIPIENT` remains a **separate** value, not the sending number. Confirm the receiving chat ID before enabling any message.

Phase 13 development adds immutable `GrowthDailyReport` archives and sticky, one-attempt `GrowthReportDelivery` state. States are `READY`, `SENDING`, `SUBMITTED`, `OUTCOME_UNKNOWN`. The sender is claimed under a database row lock before calling OpenWA; a crash, rejected response or timeout after claim must never trigger automatic replay. `SENDING` after a crash is deliberately blocked pending operator reconciliation. No daily schedule or background delivery has been activated; admin preview/testing, proper sender identity confirmation and explicit manual reconciliation controls remain pending. `SUBMITTED` means the OpenWA API acknowledged submission, not a WhatsApp delivery receipt.
