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

Pricing-backed AI call reservations, actual usage ledger/settlement, content quotas, warnings/report admin UI, bot/recipient provisioning, authorized live test, production scheduling, Phase 13 acceptance and Phase 14 rollout.
