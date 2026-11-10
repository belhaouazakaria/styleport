# SayTwist multi-account autonomous Growth target

Owner decision, November 10, 2026. **Design specification, not a production switch.**

- Target **10 genuinely distinct, eligible Pins and up to 10 corresponding new designs per connected publication account per UTC day**. One account targets up to 10; three accounts up to 30. Never promise a minimum when quality, budgets, account access or publication approval are missing.
- Different accounts may feature the same translator only with a meaningfully different editorial concept, original visual treatment, account-specific board and honest destination.
- Sync every available Pinterest account, board and Pin inventory record through bounded, cursor-based continuation and official provider rate-limit budgets. There must not be a fixed total-history size ceiling; per-execution work remains bounded and fully resumable. Backfill never skips older eligible records. Paid/provider requests stop when actual quotas demand it.
- One new-ideas/source research cycle per UTC day. One consolidated **private** owner report per UTC day.
- Independently learn posting times per account. Cold-start exploration should diversify windows; after sufficiently mature real owned-Pin observations, exploit better time slots with a reserved exploration share. Do not fabricate precision when data is sparse or stale.
- Keep the owner's 50/50 SayTwist versus authentic original source-link experiment **per account** initially, with measured reassessment, no distribution manipulation and no destination rewriting.
- AI budget is configurable. Owner prefers performance over the previous $2/day and $30/month defaults, but the current database caps must remain enforced until the owner approves new exact monetary limits and a protected release updates them. At the current conservative 30-cent reservation per image, ten images could require $3 reserved daily per account, so old budgets cannot reliably support the target. Include reserved and provider-observed costs and failures in the daily report.
- Additional accounts are owner-created and connected; the agent may only recommend expansion based on qualified performance, not auto-create accounts.
- Publication follows current Pinterest platform/user-selection and original-creative requirements. Generate drafts, select board and timing, and queue candidates automatically, but do not auto-authorize individual Pins or make multi-account engagement loops. Each Pin remains explicitly owner-approved unless a future verified permission path legitimately allows otherwise.
- Preserve existing separately SHA-pinned nine production timers, a disabled broad Growth worker, attribution OFF, current budgets, and the two pending owner-scoped Pinterest sync jobs. No migrations or production activation are authorized by this branch.

## Initial isolated implementation slice

`workers/growth-viral-discovery.ts` can conduct one fixed allowlisted public-source REVIEW scan daily at 08:15 UTC. It reuses the established reservation and advisory lock, deterministic editorial score, robots check and no-retry rules. Its root installer creates a **disabled-only** timer and private failure alert. No AI, Pinterest writes, new global worker or migration is introduced.

`lib/growth/portfolio/per-account-creatives.ts` is a **pure, non-executing planner** for 10 creative slots per connected account, distinct editorial concepts, and global budget allocation. It does not change production caps, generate assets, schedule Pins or grant approvals.

## Next engineering gates

1. Add capped-by-request but unbounded-in-total resumable official Pinterest account/board/Pin sync and reconciliation. Preserve provider pacing, job leases, cursor loop checks and recovery.
2. Convert the pure multi-account planner into one account-persona-specific creative generation lane with configurable cost ceiling, verified own-original content, fair allocation and quality review. Require proper migration qualification for altered DB caps.
3. Add an account-aware cold-start timing scheduler followed by account-local empirical learning.
4. Connect approved Pin scheduling and a consolidated daily private Telegram report. Require clear statuses, no blind retries after unknown Pinterest outcomes, and operational alerts.
5. Qualify and activate only after CI, isolated database tests, protected owner approval, exact-SHA deployment, nine-timer hold/restore and one bounded live acceptance.

No source-only merge constitutes full-autonomy activation.
