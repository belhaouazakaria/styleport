# SayTwist: Private Telegram Pin review and destination defaults

**Status:** Feature branch only. **Not deployed, migrated, enabled, or webhook provisioned.**

## Owner experience

1. Growth's existing Creative Lab and daily fresh-creative preparation continue to create exact READY candidate images and editorial copy. No blanket publishing is permitted.
2. The daily private Telegram report scheduler can optionally send up to **three** new, READY candidates for individual review (within the previous 72 hours). An admin can also send an individual candidate using Creative Lab's **Send this Pin to Telegram** action. Repeated or ambiguous sends are not retried automatically.
3. Each private Telegram card includes the exact image, title, description, automatically selected board, scheduled UTC time, and default destination hostname. Buttons: **Approve Pin (default website)**, **Approve Pin (other Translator website)**, **Reject this Pin**. Only Translator paths can select `translator.whattypeof.com`; Ideas always use `saytwist.com`.
4. One click confirms that exact candidate, its specific board and scheduled time. The existing immutable approval snapshot, daily viral portfolio quota, publication job, idempotency and publisher gates are used unchanged.
5. No manual board/timing selection is required in Creative Lab. The automatic plan prefers a valid candidate-associated board, otherwise deterministically scores title/topic/description against board title/description. When there is more than one board and no relevance signal, approval fails closed rather than putting unrelated Pins on arbitrary boards. The existing timing model chooses the time.
6. Admin Growth settings expose **Default Pinterest destination website**, initially `saytwist.com`. Telegram defaults to that choice without asking the owner separately each time. The other domain remains an optional per-Pin override.

## Trust and privacy

- Pinterest's current developer guidelines require user consideration of each Pin. This flow keeps explicit per-Pin approval and does not auto-publish unreviewed Pins.
- The callback API is `POST /api/growth/telegram-pin-review`. It requires a separately generated high-entropy `x-telegram-bot-api-secret-token` and exactly the configured **private** Telegram chat ID **and sender ID**, never a group.
- The review stores the candidate revision, recipient message ID, account, board, time, owner admin user, and terminal decision. Every callback is a one-time atomic `SENT -> PROCESSING` claim. Message mismatches, replayed, expired or stale-revision responses are rejected.
- An ambiguous Telegram send is recorded `UNKNOWN`, not automatically replayed. A failed final publication is not blindly retried.
- Bot token, chat ID and webhook secret remain server-only and never printed in logs or returned in admin API responses.
- Existing Pinterest provider transport remains at **4/hour and 16/24h**, with its own account scopes, budget reserve, exact candidate approval and cross-worker lease gates. Telegram review sends require no Pinterest API calls.
- Growth/attribution remain OFF. No publication is initiated by the Telegram courier. The existing scheduled approved publisher continues to publish only individually approved Pins.
- Every default/overridden destination still carries the same explicit `utm_*` and `pin_ref` parameters, and exact chosen hostname, path and query are bound to the immutable approval snapshot.
- Legacy URLs require a **production redirect check** to confirm HTTPS redirects land at the expected canonical Translator while preserving the tracking parameters. The presence of the option is not proof that Pinterest will distribute a redirected-domain Pin; `saytwist.com` is the recommended default. Do not use the legacy hostname to evade Pinterest link restrictions.

## Server-only configuration (not supplied through chat)

Private report sender's root-managed env must **separately** opt in:
```ini
GROWTH_TELEGRAM_PIN_APPROVALS_ENABLED=true
GROWTH_TELEGRAM_PIN_OWNER_USER_ID=<exact admin database user ID>
GROWTH_TELEGRAM_PIN_WEBHOOK_SECRET=<independent 32+ character randomly generated secret>
```
The existing private sender credentials `TELEGRAM_BOT_TOKEN` and `TELEGRAM_REPORT_CHAT_ID` remain required.
The Next.js web application that accepts callbacks also needs the independent enablement flag, exact private-chat ID, bot token and same webhook secret, **as server-only secret settings**. Nothing is exposed to `NEXT_PUBLIC_*` or published in repo.

The operator must configure the Bot API `setWebhook` once for `https://saytwist.com/api/growth/telegram-pin-review`, with exact secret header token and **callback_query-only** updates. A new secret must be issued if any existing webhook compromise is suspected. Do not call `setWebhook` in CI, on page load, or implicitly on application deployment.

## Acceptance and rollout gates

1. CI lint, typecheck, unit tests and build.
2. Isolated PostgreSQL 18 clone: rehearse the dated **additive** migration, verify existing settings and old approvals remain intact, validate constraints, rollback separately, then independently approve live migration.
3. Ensure legacy redirect retains path, query and destination on actual production HTTPS. Otherwise keep legacy choice disabled at rollout.
4. Verify Telegram bot private recipient, webhook secret and owner-user mapping without printing credentials. Existing daily reporting must remain reliable.
5. Demonstrate two fake Telegram callbacks (approve/reject), replay blocking, wrong group/chat, wrong message, expired review, stale candidate revision, token failure, domain substitution, and one approved publication job on a clone. No live Pinterest Create Pin is used during tests.
6. Use a **new exact-SHA 12-timer** hold/deploy/restore coordinator for each release. The historical `coordinate-growth-twelve-timer-evidence-release.sh` is pinned to an older baseline and cannot be reused unchanged. The migration is independently approved, with backups and an isolated rehearsal, **before** any app deploy that references the new column/table.
7. Prove service and callback health while configuration remains OFF. Turn on only after independent operator authorization; verify the first real private review and one explicit Pin approval.
8. Preserve current rate limits, send-volume caps, full audit evidence, remaining Growth OFF and attribution OFF.

## Known limitations

- The courier currently runs with the daily private reporting schedule, not instantly after creative generation. Individual Creative Lab sends can be started on demand.
- A failed or UNKNOWN Telegram offer requires operator investigation before resending. Automatic replays are intentionally disabled.
- The automatic board selector refuses an ambiguous multi-board match and the scheduled time must still be in the future when the owner approves.
- Source-program Pins are a separate publishing workflow; this feature applies to SayTwist Creative Lab candidate Pins.
- This does not repair stale Pinterest analytics or generate new evidence. Analytics recovery is a separate bounded production workstream.
