# Product Specification

## 1. Product name

Working internal name: **SayTwist Growth Agent**

This is a subsystem of SayTwist, not a separate product and not a separate public subdomain.

## 2. Product objective

Build a Pinterest-first autonomous growth loop that increases qualified traffic to SayTwist while preserving content quality, Pinterest compliance, controllable AI spend and full administrative visibility.

The agent should learn which topics, translators, editorial angles, creatives, accounts and publishing windows produce the strongest downstream usage.

## 3. North-star metric

**Qualified Pinterest Conversion (QPC)**

Initial definition:

> A visit attributable to a Pinterest Pin that results in at least one successfully completed SayTwist translation during the attribution window.

This definition must be versioned in analytics so it can evolve without rewriting historical data.

### Supporting metrics

Priority order:

1. Qualified Pinterest conversions.
2. Qualified conversion rate from Pinterest landing sessions.
3. Outbound clicks from Pinterest.
4. Outbound click rate.
5. Saves.
6. Engagement.
7. Impressions/reach.

Raw impressions must never be treated as equivalent to growth success.

## 4. User roles

### Admin/operator

The owner/admin needs to:

- see what the agent is doing;
- understand why it is doing it;
- approve each Pinterest Pin for publication as required by current Pinterest developer rules;
- inspect performance by account, Pin, topic, destination, creative and time;
- adjust cost/workload controls;
- see AI spend;
- inspect opportunities;
- review warnings and recommended actions;
- receive one concise daily executive report;
- roll back content changes when necessary.

### Pinterest visitor

A Pinterest visitor should land on content that delivers the promise made by the Pin.

Landing experiences:

- translator pages;
- `/ideas` editorial pages;
- future collection pages where useful.

## 5. Autonomy

The agent may autonomously:

- ingest analytics;
- detect winning/declining topics;
- identify inventory gaps;
- create new translators;
- improve existing translators;
- create `/ideas` content;
- generate Pin concepts and images;
- choose intended Pinterest account;
- choose boards;
- choose candidate publishing time;
- prepare publishing jobs;
- revive evergreen content;
- run approved experiments;
- adjust recommended volume;
- prepare reports;
- recommend new accounts or account repositioning.

Pinterest publication has a compliance approval gate. The operator must specifically choose/approve each Pin before it can be published/scheduled unless Pinterest explicitly approves a different workflow for this app.

The agent never creates a new Pinterest account automatically.

## 6. Growth intensity

Admin-configurable modes:

- Low
- Balanced
- Aggressive
- Custom

These modes adjust ceilings for:

- AI spend/day;
- new translators/day;
- translator edits/day;
- Ideas pages/week;
- Pin candidates/day/account;
- expensive image generations/day;
- research depth;
- experiment allocation.

They are ceilings, not mandatory production targets.

## 7. Core decision classes

For each opportunity, the agent may choose:

- `CREATE_TRANSLATOR`
- `IMPROVE_TRANSLATOR`
- `CREATE_IDEA`
- `IMPROVE_IDEA`
- `CREATE_COLLECTION`
- `REVIVE_TRANSLATOR`
- `REVIVE_IDEA`
- `CREATE_PIN_VARIANT`
- `START_EXPERIMENT`
- `WAIT_FOR_MORE_DATA`
- `NO_ACTION`

Every decision stores evidence, confidence, expected value, cost estimate and actual outcome where measurable.

## 8. Non-goals for initial release

- Video Pins.
- Paid Pinterest ads.
- Automated comments/messages/following.
- Engagement farming.
- Browser automation.
- Unofficial Pinterest scraping used to perform account actions.
- Mass account creation.
- Cross-account duplicate flooding.
- Automated creation of new Pinterest accounts.
- Generic AI blog spam.
- A separate Growth subdomain/app.
- Arbitrary social networks beyond Pinterest in the first release.

The architecture should remain extensible enough to add another social platform later, but Pinterest is the only initial integration.

## 9. Success criteria

The first production milestone is successful when:

- at least one Pinterest business account is connected through the official API;
- analytics sync reliably;
- Pin -> SayTwist conversion attribution works;
- opportunities are generated from real data;
- the agent can create/improve content safely;
- the current renderer is measurable as a control;
- approved Pins can be scheduled/published through the official API;
- performance feeds back into decisions;
- AI costs are recorded;
- the admin can understand the system;
- daily executive reporting works;
- failure of Growth components cannot take down core SayTwist.

## Targeting and measuring

Worldwide English is the audience; cold-start Pinterest tests and schedules are US-first, with later settings informed by first-party data. The north star is a session with at least one trusted, Pinterest-attributed successful translation, including embedded Ideas use. Outbound clicks are an upstream diagnostic. See `ANALYTICS_ATTRIBUTION.md` and `DATA_MODEL.md` for exact deduplication.
