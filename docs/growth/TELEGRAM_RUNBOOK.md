# Telegram Growth daily digest — operator runbook

**Status: disabled-by-default feature branch only. No production send or schedule has been authorized.**

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
