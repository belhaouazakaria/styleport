# Decision Log

Durable product/architecture decisions for the SayTwist Growth Agent.

Do not delete old decisions when superseded. Mark them superseded and add the replacement.

## D-001 — Growth stays inside SayTwist admin

**Status:** Accepted

Use `/admin/growth` instead of a separate Growth subdomain/app.

A separate worker/process is allowed and expected.

## D-002 — `/ideas` is mandatory

**Status:** Accepted

The Growth system includes an editorial/inspiration surface under `/ideas`. It is not treated as an optional generic blog.

## D-003 — Initial Pinterest portfolio is three intent-driven publications

**Status:** Accepted

Initial strategy:

- SayTwist -> utility/discovery
- SayTwist Ideas -> inspiration
- SayTwist Playground -> entertainment

Do not initially split accounts into narrow categories such as "Work" solely because translators exist for that category.

## D-004 — Account count is data-driven after launch

**Status:** Accepted

Start with three accounts. The agent reviews the portfolio monthly and recommends expansion/repositioning only when evidence supports it.

The agent never creates Pinterest accounts automatically.

## D-005 — Primary optimization target is qualified conversion

**Status:** Accepted

Outbound clicks are important, but the system optimizes toward Pinterest-attributed successful translations.

## D-006 — Full SayTwist-side autopilot

**Status:** Accepted

The agent may autonomously create/edit translators and Ideas content, generate creative candidates, select accounts/boards/times, revive content and run permitted experiments, subject to configured limits, quality gates, versioning and rollback.

## D-007 — Pinterest publication requires specific Pin approval

**Status:** Accepted due to current external policy constraint

Current Pinterest developer guidelines require the end user to choose each Pin that will be published/scheduled through an app.

Therefore the initial production mode is:
- autonomous candidate generation;
- exact Pin shown in admin;
- explicit per-Pin approval;
- system publishes the approved Pin at the chosen/recommended time.

This decision may change only if Pinterest explicitly permits/approves a different automation workflow for this application.

## D-008 — Official Pinterest API only

**Status:** Accepted

No browser posting bot, password bot, cookie automation or anti-spam evasion.

## D-009 — Existing Pin renderer is V1 control

**Status:** Accepted

The current automatic translator Pin image generator is retained and measured as the baseline control before new visual systems are judged.

## D-010 — Static images only initially

**Status:** Accepted

Do not implement video Pin generation in the initial roadmap.

## D-011 — Agent decides recommended publishing volume

**Status:** Accepted

The agent chooses recommended volume based on account maturity/performance within admin-configured ceilings.

## D-012 — AI budget is flexible and visible

**Status:** Accepted

No fixed budget is locked at planning time.

Admin gets spend reporting and settings to reduce/increase workload and impose hard ceilings.

## D-013 — Warning-first account behavior

**Status:** Accepted

For performance/policy-risk signals, notify the operator with evidence and recommended action rather than autonomously disabling accounts.

Mechanical failures may stop individual jobs naturally.

## D-014 — Daily report is concise executive digest

**Status:** Accepted

One recipient. Include:
- main performance;
- breakout content;
- actions completed;
- AI spend;
- important warning(s);
- tomorrow's plan.

Full detail remains in `/admin/growth`.

## D-015 — WhatsApp desired, not assumed free

**Status:** Accepted

Implement notification provider abstraction. Verify current WhatsApp Business Platform cost/requirements during implementation and provide email fallback.

## D-016 — "Do nothing" is a valid agent outcome

**Status:** Accepted

The agent must not manufacture content purely to satisfy a daily quota.

## D-017 — Do not create fake subdomains for Pinterest account claims

**Status:** Accepted

Main SayTwist should claim the root domain. Satellite accounts are authentic editorial publications, not separate fake properties created to work around platform constraints.

## D-018 — Living documentation is mandatory

**Status:** Accepted

Growth docs are part of the source of truth. Relevant documents must be updated whenever implementation changes durable behavior.

## Open decisions

These must be resolved before the relevant phase:

1. Primary Pinterest audience geography/language.
2. Whether `saytwist.com` is already claimed and by which account.
3. Exact additional Pinterest accounts already owned, if any.
4. Attribution return window and first/last-touch rules.
5. WhatsApp provider/setup after current pricing and eligibility check.
6. Exact job scheduling technology after inspection of current SayTwist production architecture.
