# SayTwist Growth Agent

**Status:** Phase 7 complete, production deployed, and live validated; attribution collection intentionally disabled
**Scope:** Pinterest-first autonomous growth system inside SayTwist  
**Primary admin surface:** `/admin/growth`  
**Primary public expansion:** `/ideas`  
**Roadmap size:** 14 implementation phases

## Feature brief

The SayTwist Growth Agent is a Pinterest-first growth system that continuously learns what content brings qualified traffic to SayTwist, expands winning niches into new translators and editorial content, prepares Pinterest creatives, schedules approved Pins at data-driven times, revives evergreen content, measures results, tracks AI spend, and produces a concise daily executive report.

The system is not a "post more Pins" bot. It is a closed-loop growth engine:

`Pinterest performance -> SayTwist conversion data -> opportunity detection -> content decisions -> creative testing -> publication -> measurement -> learning`

The north-star metric is **qualified Pinterest conversions**, initially defined as a Pinterest-attributed visitor completing a translation. Outbound clicks remain a key upstream metric, but are not the final optimization target.

## Initial publication strategy

Launch with three authentic Pinterest publications:

1. **SayTwist** — utility/discovery: translators and direct tool use.
2. **SayTwist Ideas** — inspiration/save intent: useful idea pages and editorial content.
3. **SayTwist Playground** — entertainment/share intent: playful language content, interactive concepts and relatable transformations.

These are different editorial experiences, not duplicate distribution accounts. The same topic may appear across multiple publications only when the content concept, user intent and destination experience are genuinely different.

The initial account count is three. The agent reviews account performance monthly and may recommend adding, merging or repositioning accounts. It never creates Pinterest accounts by itself.

## Non-negotiable principles

- Use the official Pinterest API and approved Pinterest automation only.
- Do not use browser automation, credential sharing, scraping-based account actions or anti-spam evasion.
- Do not use multiple accounts to manipulate distribution.
- Do not publish repetitive Pins with superficial visual changes.
- Every account must have an authentic editorial purpose.
- Every destination page must provide original value.
- Pinterest publishing must respect Pinterest's developer requirement that the end user specifically chooses each Pin to publish. The agent may fully prepare and schedule candidates, but an approval gate remains unless Pinterest explicitly approves a more autonomous publishing workflow for this app.
- AI can autonomously create and improve SayTwist-owned content subject to SayTwist quality, safety and rollback rules.
- "Do nothing" is a valid daily agent decision.
- Every autonomous decision must be auditable.
- Cost is a first-class metric.
- Documentation is living source-of-truth and must change with implementation.

## Source-of-truth documents

Read these before changing the Growth system:

- `AI_CONTEXT.md`
- `PRODUCT.md`
- `ACCOUNT_STRATEGY.md`
- `AGENT_AUTOMATION.md`
- `CONTENT_AND_IDEAS.md`
- `PINTEREST_INTEGRATION.md`
- `ANALYTICS_ATTRIBUTION.md`
- `ADMIN_REPORTING_COSTS.md`
- `ARCHITECTURE.md`
- `TESTING_SECURITY_ROLLOUT.md`
- `ROADMAP.md`
- `DECISIONS.md`
- `IMPLEMENTATION_MAP.md`
- `DATA_MODEL.md`

If implementation changes behavior described here, update the relevant document in the same phase/commit.

## Confirmed targeting and accounts

- English-speaking worldwide; initially optimize US scheduling, experiments and trend interpretation, then adapt to first-party performance.
- `saytwist.com` is already claimed by the main SayTwist Pinterest account. Additional existing accounts will later be rebranded SayTwist Ideas and SayTwist Playground. No account creation is needed for launch.

## Remaining implementation checks

- Only static/image Pins are in scope initially. Video is out of scope.
- Pinterest Trial access is approved. The main `@saytwist` Business account is connected, Phase 3 account/board reads were live validated, and Phase 4 organic analytics and owned-domain relevance were live validated. Phase 5 is production deployed; attribution capability is available, but both collection gates remain false, so no visitor attribution rows or attribution cookie were created. Phase 6 deterministic account strategy is production deployed and live validated. Phase 7 corrected opportunity intelligence is production deployed and live validated using deterministic local evidence only. Growth and attribution were disabled again after validation. Phase 8 — Translator Autopilot — is next.
- WhatsApp reporting is desired for one recipient, but provider setup and current pricing must be verified before implementation.

See `IMPLEMENTATION_MAP.md` for verified repository facts and `DATA_MODEL.md` for implemented and proposed schema/state contracts.


## Phase 7 production correction

The initial production `opportunity_intelligence_v1` / `content_clustering_v1` run collapsed 221 eligible Pins into the structural `/translators/` route topic. Its rows remain untouched as historical audit evidence. The corrected production models are `opportunity_intelligence_v2`, `content_clustering_v2`, and unchanged `opportunity_scoring_v1`. Live v2 validation considered 221 eligible Pins under the 500-Pin cap with `KNOWN` evidence and `NOT_COLLECTING` attribution, producing eight deterministic clusters, two opportunities, and two WINNER Pin signals at 85% average confidence. No `translator` or `translators` structural cluster remained. Growth was disabled again after validation; no Pinterest mutation, AI call, content mutation, scheduler, cron, or persistent Growth worker was introduced.
