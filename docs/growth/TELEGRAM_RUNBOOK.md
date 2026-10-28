# Telegram Growth daily digest — operator runbook

**Status (2026-10-28):** deployed, private bot and recipient independently verified, one owner-approved Telegram report `growth-20261024` received on 2026-10-25. No recurring schedule, general Growth execution, Pinterest publication or AI costs are authorized. Keep both delivery/schedule gates disabled by default.

## Transport contract

- Use official Telegram Bot API over HTTPS to api.telegram.org, POST /sendMessage.
- Exactly one operator-controlled **private** chat; groups, public channels and usernames are rejected.
- Outbound only. No bot polling daemon, webhook, Chrome, QR pairing or persistent browser session.
- Enforce once-only database claims before attempting an external message. A successful API submission is not a read receipt. Never automatically retry an attempted send, including timeouts, rate limits and malformed responses.
- Protect all credentials in private server environment; never commit them or expose them in HTML, logs, exceptions or activity records.

## Environment

| Setting | Meaning |
| --- | --- |
| TELEGRAM_REPORTS_ENABLED | Must remain false unless a specific controlled send has been approved; defaults false |
| TELEGRAM_BOT_TOKEN | Secret from official @BotFather; keep out of Git, shell history and logs |
| TELEGRAM_REPORT_CHAT_ID | Single positive numeric private recipient chat ID; no group, channel, handle or list |

## Operator provisioning — no send implied

1. Create a dedicated bot with official Telegram @BotFather. Protect its bot token immediately.
2. On the *intended recipient* Telegram account, open the bot's private chat and press Start; bots cannot normally initiate chats.
3. Obtain the private chat ID through a deliberate one-time Bot API getUpdates request on a bot without an existing webhook. Inspect only private-chat metadata and positively verify recipient identity; do not dump raw updates, messages, profiles or token-bearing URLs into logs or support chats.
4. Verify the token with getMe using a safe server-side script. Do not print the token or the Bot API request URL.
5. Set the secret token and confirmed private chat ID in the private deployment environment, leaving TELEGRAM_REPORTS_ENABLED=false.

## Controlled acceptance and rollback

After code/CI/security review, explicitly authorize **one** delivery test to the verified recipient. Inspect the archive, durable delivery claim, Bot API response message ID and actual message receipt in the recipient chat. A failed or ambiguous call must remain blocked for operator reconciliation; do not retry or clear the delivery row. Do not enable any recurring report until Phase 13 is complete and Phase 14 is qualified.

Rollback: disable TELEGRAM_REPORTS_ENABLED; retain all historical delivery records, archived report data and unknown-outcome claims. Never delete the audit trail to unlock sending.

## Still outstanding

Read-only project-level Costs API groundwork and spending/content admission, warnings and report archive UI are implemented and CI-tested; they are **not activated**. Still required: defensible trusted cost provenance/settlement (or expressly accepted aggregate-only limitation), separately authorized staging PostgreSQL 18/admin UI/security acceptance, operator private bot/recipient provisioning, exactly one authorized live receipt test, and final Phase 13 approval before any production schedule or Phase 14 rollout. See `PHASE13_RELEASE_QUALIFICATION.md`.


## Phase 13K controlled daily-runner readiness (no live send authorized)

The code supports a one-shot `npm run growth:daily-report` CLI, not a running daemon. By default it returns DISABLED and makes **no provider calls and no archive**. For an authorized future scheduled report, both private server-side settings must be enabled:

- `GROWTH_DAILY_REPORT_SCHEDULE_ENABLED=true`: permits the scheduled reporting entry point (default off).
- `TELEGRAM_REPORTS_ENABLED=true`: independently permits Telegram Bot API submission (default off).

The UTC runner never selects today's incomplete data. It targets the previous UTC calendar day at/after 04:00 UTC, and uses the existing once-only database delivery claim. Repeated invocations of an already SUBMITTED archive return ALREADY_SENT without sending. SENDING or OUTCOME_UNKNOWN stays blocked. Do **not** add a VPS timer, cron entry, webhook, bot polling or enabled flag until the operator has completed a **single explicitly authorized live recipient test** and all Phase 13/14 security rollout gates have passed.

**Operator action required at the live-test gate, not before:** create a dedicated Telegram bot with @BotFather, start its private chat from the destination Telegram account, securely collect and independently confirm the private numeric chat ID without sharing the token, configure token/chat ID as private deployment secrets, and confirm a deliberately requested test appears once in that chat. Run this only in the approved isolated/staging context before production scheduling. In parallel, trusted actual billing reconciliation requires operator-supplied authentic provider billing records; API usage estimates are not invoices.

## Phase 13M — one-time, no-send Telegram provisioning checks (2026-10-25)

A dedicated bot can now be connected and verified without delivering a report or enabling any automation. The operator must keep the bot token private, must not paste it into Git, PRs, logs, this chat, or screenshots, and must not run the production report runner.

1. Use official [@BotFather](https://t.me/BotFather) to create a dedicated reporting bot using `/newbot`. Choose a memorable display name, e.g. **SayTwist Growth Reports**, and a unique username ending in `bot`. Store the returned token in a password manager. Leave `TELEGRAM_REPORTS_ENABLED=false` and `GROWTH_DAILY_REPORT_SCHEDULE_ENABLED=false`.
2. On the **intended recipient's** Telegram account, open a private conversation with that bot. Generate a random one-time code locally, then send `/start <code>` in the **private bot chat**. Never send it in a group.
3. On an isolated local/staging checkout of this branch (not the production VPS), load `TELEGRAM_BOT_TOKEN` securely from a private prompt (do not type it into shell history). Set `TELEGRAM_REPORT_PAIRING_CODE` to that random 16–32-character lower-case hexadecimal code. Execute `npm run growth:telegram:discover`. It calls **only** Telegram `getUpdates` once without offset or long polling, matches the exact one-time code only in a private chat, and saves the numeric ID in `~/.config/saytwist/telegram-private-chat-id` with mode 0600. It never prints bot token, chat ID, messages, or responses. If the file already exists, the discovery script deliberately fails closed rather than overwriting it. If the bot has a webhook or queued updates do not include the new message, discovery cannot complete; do not force a send/retry.
4. Set `TELEGRAM_REPORT_CHAT_ID` locally from that restricted file, then run `npm run growth:telegram:verify`. The verifier makes exactly two **read-only** Telegram requests: `getMe` and `getChat`. It confirms the bot identity and an exact private recipient but sends **no message**. The CLI prints only Boolean verification outcomes.
5. Remove temporary `TELEGRAM_BOT_TOKEN`, `TELEGRAM_REPORT_PAIRING_CODE` and `TELEGRAM_REPORT_CHAT_ID` from the interactive shell. Do not copy the ID file to the repository or an unprotected environment. When production rollout is separately authorized, provision token/chat ID through the server's private environment mechanism.

**Live testing is a separate explicit user approval.** No cron, VPS deployment, database migration, bot message, Growth enablement, paid OpenAI test, or Pinterest publication follows automatically from this setup. After bot verification, the only next live step is one specifically authorized private Telegram acceptance message, with the recipient confirming its arrival. Report job activation is later still and depends on the remaining Phase 13/14 gates.

## Phase 13P — one-shot, explicitly confirmed staging delivery acceptance (NOT RUN)

`npm run growth:telegram:acceptance` invokes `scripts/growth-telegram-acceptance.ts` once. It is **disabled by default**; it does not install cron or run the general daily scheduler. It uses the regular immutable previous-complete-UTC-day archive and existing PostgreSQL at-most-one send claim. It refuses a stale date, disabled private Telegram channel, missing exact report confirmation, enabled daily schedule, or an environment not explicitly labelled isolated staging. It never changes Growth, attribution, pricing or Pinterest state. The CLI prints no bot token, private recipient ID or message body.

**Only after separate explicit operator approval for exactly one real send**, set all of the following in a private isolated staging process environment, using the securely verified bot/recipient values (not GitHub secrets or chat):

```dotenv
GROWTH_TELEGRAM_ACCEPTANCE_ENABLED=true
GROWTH_TELEGRAM_ACCEPTANCE_ENVIRONMENT=isolated-staging
GROWTH_TELEGRAM_ACCEPTANCE_CONFIRMATION="SEND ONE TELEGRAM REPORT growth-YYYYMMDD"
GROWTH_DAILY_REPORT_SCHEDULE_ENABLED=false
TELEGRAM_REPORTS_ENABLED=true
# TELEGRAM_BOT_TOKEN and TELEGRAM_REPORT_CHAT_ID: secret values supplied privately
```

Replace `growth-YYYYMMDD` with the exact previous **complete** UTC date for the invocation. Run only `npm run growth:telegram:acceptance` in the approved isolated checkout; do not enable or invoke the daily runner. If the CLI reports `SUBMITTED`, the operator verifies in the private Telegram recipient chat that **one** report appeared. Failure, SENDING or OUTCOME_UNKNOWN must be manually reconciled: do not retry or clear the DB record. After the single attempt, immediately return acceptance/report flags to false and scrub temporary environment variables. The flags do not provide an authorization bypass for running on production; the operator is responsible for choosing the correct isolated database before issuing a send.

## Owner-only delivery safeguards (2026-10-25)

Telegram does not offer a fully hidden bot account: anyone finding the bot username may open its chat or send it a message. They cannot read another recipient's private report without the bot token or recipient account access. The Growth implementation has **no inbound handler or webhook**, sends only to an explicitly configured positive numeric **private chat ID**, and verifies the recipient via `getChat` and the provider's private-chat response.

Required BotFather action: send `/setjoingroups`, choose this reporting bot, select **Disable**. After this, the read-only `growth:telegram:verify` requires the `getMe.can_join_groups` flag to be exactly false or fails with `GROUP_JOINING_NOT_DISABLED`; it makes no `sendMessage` call. The one-time `/start <fresh random hex>` discovery requires a private chat **and matching sender identity**, not a group/channel or forwarded/mismatched user. Keep the token secret. Do not use `setprivacy` as a substitute for disabling group joins.

The operator has created the bot, not yet completed no-send pairing. The operator separately chose production-only rollout with no permanent staging site. For production, do not spoof the `isolated-staging` marker on the existing test command; follow `PHASE13_PRODUCTION_NO_STAGING.md` and obtain approval for a distinct production acceptance procedure **after** the backed-up release and provider verification. Daily schedule still OFF. Never paste bot token/chat ID into issue comments, ChatGPT, GitHub or server logs.

## Production-only operator decision and exact message approval (2026-10-25)

No permanent staging site is planned. The acceptance CLI was extended to **support** a separately approved production-only single message without weakening the earlier staging safety: it verifies the production database target exactly, requires the explicit production environment label and **an additional production-specific day-bound confirmation** besides the ordinary exact report confirmation. Both flags and the real bot/chat config are default off. For the complete field contract, see PHASE13_PRODUCTION_NO_STAGING.md. This change does **not** authorize a real send, production merge or deployment; bot owner receipt and explicit follow-on scheduler approval remain required.


## Pairing recovery — safe diagnostic codes (2026-10-25)

The no-send discovery CLI previously hid all error details. It now prints only a controlled uppercase diagnostic code; provider responses, exception messages, Telegram Bot API URL, token, private chat ID and nonce remain suppressed. Use the exact same local checkout and an **entirely fresh** pairing nonce; after sending the new `/start <nonce>` in the intended bot's private chat, run `npm run growth:telegram:discover`.

- `INVALID_PAIRING_CONFIGURATION`: environment did not contain a valid BotFather token and 16–32 lowercase-hex nonce; make sure both exported variables reached the *same shell process*.
- `PAIRING_MESSAGE_NOT_FOUND`: bot did not receive the exact new private `/start <nonce>` among up to 100 currently unconfirmed updates. Check bot username, own Telegram account, code with no extra punctuation, correct chat (not BotFather), webhook and any other update consumer; avoid creating additional bots.
- `PAIRING_UPDATES_UNAVAILABLE`: Telegram rejected `getUpdates`; credentials, an existing webhook or another Telegram-side conflict may be the cause. The CLI will not print a raw provider response. Only `getWebhookInfo` can establish whether a webhook is present; do not blindly clear webhook/pending updates.
- `PAIRING_REQUEST_FAILED` / `INVALID_UPDATES_RESPONSE`: network/timeout or invalid provider JSON; check connectivity and retry manually with a *new* nonce once cause is established.
- `PRIVATE_RECIPIENT_FILE_ALREADY_EXISTS`: a previous pairing already saved a recipient; do not delete or overwrite without verifying it is your intended chat. Run the read-only verifier with the existing restricted file instead.
- `AMBIGUOUS_PRIVATE_RECIPIENT` / `UNEXPECTED_LOCAL_ERROR`: stop and investigate; never pick a recipient arbitrarily.

No database, webhook, cron, messaging, publisher or paid OpenAI request is run by this diagnostic. In particular **never post** the token, private recipient ID, nonce, `getUpdates` JSON or Bot API URLs in issues or chat.

## Phase 13 private recipient verification — operator confirmed 2026-10-25

The operator ran the no-send `growth:telegram:discover` locally and reported a restricted recipient-ID file was created. The operator then executed the read-only `growth:telegram:verify` and reported `bot verified: true`, `private chat verified: true`, and `No messages sent; delivery remains disabled.` This validates the private recipient / BotFather group-disabled settings, *not* a delivered message or independent server-side credentials. Token, numeric chat ID, one-time nonce and Telegram response bodies were not submitted to the repository or assistant. **No report has been sent.**

For no-permanent-staging production rollout, the next required step is a sanitizer-safe read-only preflight of the live database migration inventory and Growth/attribution switches. This precedes any independently approved PostgreSQL 18 backup and clone restore, Phase 13 migrations, controlled manual release or single-message receipt check.
