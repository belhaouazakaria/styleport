# Viral Pin Intelligence: controlled dual-channel translator demand testing

Status: **PR #163 merged into source; PR #164 second development slice in review. No viral schema migration, feature activation or new publisher is confirmed live.**
Current production baseline has nine existing Growth timers. Do not disturb
those through source merges. Owner task: issue #162.

## Goal

Discover translator *topics* at https://anythingtranslate.com/translators/
and test them alongside original SayTwist topics. Split the authorized Pin
quota between honest SayTwist destinations and permitted original source
destinations, initially 50/50. If official owned-Pin evidence identifies a
winner, generate an original SayTwist translator and expand adjacent niches.

Competitor Pinterest profile need not remain accessible.
Owner-reported best Pin IDs: 1019995015645788765 and 1019995015645788898.
Owner anecdotes are not provider-verified analytics.

## Source, creative and link policy

- Discover bounded title + URL metadata only from exactly one allowlisted
  public catalog. Check robots.txt first, fail closed on denied access or
  unknown redirect, never copy source prompts, images, descriptions or Pin
  media. Public access does not confer publishing rights.
- Source-linked Pinterest creatives must use genuinely original or licensed
  images and titles. They truthfully describe the destination. Every Pin
  remains individually owner approved.
- Do not automate repointing a popular existing Pin to manipulate
  distribution. Create a NEW SayTwist Pin linking directly to the original
  winning translator once it exists.
- A third-party destination's distribution does not demonstrate SayTwist
  destination-domain authority. Track channels independently.
- All newly added settings default PAUSED. ACTIVE only plans qualified
  candidates, never overrides provider permission or per-Pin approval.
- Preserve 1 Translator/day, 3 AI images/day, $2 daily and $30 monthly
  spending caps, existing Pinterest API caps and the private alert path.

## First development slice (source-only)

1. lib/growth/viral/portfolio.ts: deterministic quota planning; committed
   work, rights and hard caps restrict each channel; no implicit reassignment.
2. lib/growth/viral/catalog.ts: bounded, fixed-domain public catalog
   discovery of titles and source URLs, after a robots check.
3. lib/growth/viral/winners.ts: require mature fresh provider evidence,
   real saves and outbound clicks, and lift against owned-account baseline.
4. lib/growth/viral/niche.ts: capped, nonduplicate original related-topic
   proposals. Planning alone never creates or publishes a translator.
5. Additive PostgreSQL GrowthViral* models: policy, concepts, Pin experiments,
   append-only metric observations and niche proposals. New destination
   updates prohibited by database trigger; all existing Growth core tables
   and schedules are unchanged.
6. Admin-only API under /api/admin/growth/viral and panel under
   /admin/growth/viral. Same-origin guarded mutations, audit and one scan/day.
   Only own connected Pinterest account Pins can be imported for tracking.
   Winner scoring reuses stored official analytics, not new provider requests.

## Second development slice (PR #164, source-only until separately qualified)

- Generates original 1000×1500 PNG artwork and truthful third-party destination text from allowed catalog topics; never imports third-party media or copyrighted prompts.
- Admin prepares a draft, views the immutable asset, chooses a connected account/board and future schedule, and explicitly approves that exact Pin.
- Both existing SayTwist Pin approvals and source-linked approvals take the same PostgreSQL transaction-scoped advisory lock, then count BOTH channels before admitting a new Pin. The 3/day hard cap and fixed fair split prevent concurrent overbooking.
- The separately isolated official API publisher claims exactly one approved draft, never blind-retries an ambiguous create, and retains audit/lease evidence. Its root-managed systemd timer is install-disabled.
- An additive schema migration enforces destination identity, approved snapshot immutability, once-only claims and deduplication. CI alone is not production migration qualification.
- Deployment requires a protected production backup, populated-clone migration rehearsal, a coordinated hold and exact-SHA restore of the NINE existing live timers, plus separate owner approval for migration, installation and any publication. No Pin is auto-approved by a code merge.

## Next development slices, NOT complete in this initial PR

- Add original image generation and individually approved source-destination
  publishing as a separate guarded pathway. Existing publisher only permits
  SayTwist-owned domains: never broaden it or bypass its security.
- Feed verified winners into quality-gated original Translator Autopilot
  preparation; preserve 1 new Translator/day limit and dedupe.
- Bounded original AI niche suggestions with model isolation, reservation
  and semantic quality review; do not copy a competitor's translation prompt.
- Use existing Creative Lab to create new SayTwist Pins for published winners.
- Couple real source and SayTwist channel conversion metrics to allocation
  optimization with exposure-confidence safeguards.
- Complete other outstanding Growth work: market research entitlement,
  multi-account learning and actual provider cost reconciliation.

## Future coordinated activation (requires owner authorization)

Before production migration/deployment, perform source CI, PostgreSQL 18
migration clone rehearsal, verified backup and an exact-release root preflight.
All existing NINE production timers need a reviewed hold and coordinated SHA
rotation. The previous six-timer coordinator is insufficient for future
releases. Build and test a nine-timer restore before requesting deployment.

Then run a protected exact-SHA production release, preserve the nine
independently approved schedules, test source analytics read-only, obtain
explicit approval for any paid AI or publication, and activate new isolated
services only after their acceptance. Keep global Growth/attribution OFF
between bounded jobs, with a null activation lease.
