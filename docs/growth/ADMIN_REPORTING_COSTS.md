# Admin, Reporting and Cost Controls

## 1. Admin location

Use the existing SayTwist admin.

Primary route:

`/admin/growth`

Do not create a separate Growth subdomain for the initial system.

Reasons:

- shared authentication;
- shared database;
- shared translator/content model;
- shared settings/secrets;
- fewer deployment/security boundaries;
- easier operator workflow.

The worker may be a separate process without becoming a separate web product.

## 2. Growth navigation

Recommended sections:

- Overview
- Opportunities
- Accounts
- Pins
- Analytics
- Content
- Schedule
- Experiments
- Agent Activity
- AI Spend
- Reports
- Warnings
- Settings

## 3. Overview

Top-level cards:

- qualified Pinterest conversions;
- Pinterest landing sessions;
- outbound clicks;
- outbound CTR;
- saves;
- impressions;
- Pins published;
- Pins awaiting approval;
- translators created/updated;
- Ideas pages created/updated;
- AI spend today/month;
- AI cost per qualified conversion;
- system health.

Include deltas versus an appropriate comparison period.

## 4. Agent Activity

Show an auditable decision log:

- what the agent decided;
- action type;
- topic;
- evidence summary;
- confidence;
- estimated value;
- estimated cost;
- actual cost;
- resources created/changed;
- outcome when available.

Do not display hidden model chain-of-thought. Store structured reasons/evidence instead.

## 5. Opportunities

Opportunity cards should show:

- opportunity title;
- content cluster;
- evidence;
- recommended action;
- target account;
- destination type;
- confidence;
- expected value;
- expected spend;
- state.

## 6. Pin approval queue

Because current Pinterest developer rules require the user to choose each Pin to publish, the admin needs an efficient approval workflow.

Each card shows:

- exact image;
- Pin title/description;
- destination;
- account;
- board;
- topic;
- intended posting time;
- reason/evidence;
- duplicate/similarity status;
- estimated role in experiment.

Actions:

- Approve this Pin
- Edit
- Regenerate
- Reject
- Defer

Scheduling happens only after explicit approval of the specific Pin.

## 7. AI spend ledger

Record per AI operation:

- provider;
- model;
- request/job;
- tokens/input/output where available;
- image generation usage;
- estimated or actual monetary cost;
- account;
- translator;
- Ideas page;
- Pin;
- decision ID;
- timestamp.

Aggregate by:

- today;
- week;
- month;
- feature;
- model;
- account;
- content cluster.

## 8. Cost settings

Support:

- daily AI spend ceiling;
- monthly AI spend ceiling;
- generated-image ceiling;
- new translators/day;
- translator edits/day;
- Ideas pages/week;
- Pin candidates/account/day;
- research depth;
- model preference;
- growth intensity preset.

Presets should translate into explicit settings visible to the admin.

## 9. Reporting

One daily executive digest is sent to one configured recipient.

Preferred shape:

**SayTwist Growth · <date>**

- Pinterest visits and delta
- qualified translator uses and delta
- breakout topic/Pin
- Pins published/approved
- translators/Ideas created
- AI spend
- one or two important warnings
- tomorrow's plan

Then:

`Open full Growth Report -> /admin/growth/reports/<id>`

Avoid sending every Pin/action in the message.

## 10. Notification providers

Use an abstraction:

- WhatsApp
- Email
- future providers

WhatsApp is desired, but do not assume it is free.

During implementation:
- verify current WhatsApp Business Platform requirements/pricing;
- configure one recipient;
- use approved templates where required;
- provide email fallback;
- record delivery status.

## 11. Warnings

Warnings do not automatically disable an account unless the user explicitly configures such a rule.

Examples:

- outbound CTR drop;
- qualified conversion drop;
- repeated publishing failures;
- Pinterest auth expiration;
- API warning/rejection;
- unusual account performance;
- high content similarity;
- AI spend acceleration;
- broken attribution;
- stale analytics.

Each warning includes:

- severity;
- evidence;
- recommended action;
- affected resources;
- status;
- admin resolution notes.

## 12. Settings safety

Dangerous/high-impact settings should require deliberate confirmation:

- disconnect Pinterest account;
- clear analytics;
- change attribution definition;
- large spend-limit increase;
- enable a newly approved publishing mode;
- delete Growth history.
