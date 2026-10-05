# Testing, Security and Rollout

## 1. Testing layers

### Unit tests

Cover:

- opportunity scoring;
- KPI calculations;
- attribution;
- scheduling;
- duplicate detection;
- cost calculations;
- state transitions;
- policy gates;
- account eligibility.

### Integration tests

Cover:

- Prisma persistence;
- job idempotency;
- content versioning;
- OAuth callback validation;
- Pinterest adapter behavior with mocked API responses;
- analytics sync;
- publication reconciliation;
- report generation.

### End-to-end admin tests

Cover:

- account connect/disconnect;
- account health;
- opportunities;
- Pin candidate review;
- per-Pin approval;
- schedule visibility;
- cost settings;
- warnings;
- reports.

### Production smoke tests

Must avoid unintended Pinterest publication.

Use explicit test accounts/sandbox/trial capabilities until production publishing is deliberately enabled.

## 2. Security

Mandatory controls:

- CSRF-safe OAuth;
- least privilege;
- encrypted token storage;
- no secret logging;
- admin authorization on all Growth routes/actions;
- validation of redirect/callback parameters;
- safe HTML/content rendering;
- rate limiting where relevant;
- idempotency;
- audit logs;
- dependency/security review for new packages.

## 3. AI safety/quality controls

AI-created content passes deterministic validation before publication.

Check:

- required fields;
- prohibited duplicate titles/slugs;
- broken links;
- unsafe HTML;
- empty/thin output;
- unsupported claims where relevant;
- malformed metadata;
- content similarity;
- category validity.

The system should fail closed on malformed generated content.

## 4. Pinterest policy gate

Before a Pin reaches approval:

- destination matches claim;
- account intent fits;
- content is relevant;
- recent duplicate check passes;
- no deceptive redirect;
- no attempt to manipulate engagement/distribution;
- exact Pin is visible to admin.

Publication requires per-Pin approval under the planning-baseline Pinterest developer rules.

## 5. Cost safety

- pre-estimate expensive AI jobs where possible;
- record actual usage;
- honor configured hard limits;
- skip optional expensive steps when limits are reached;
- never retry expensive generations indefinitely.

## 6. Rollout modes

### Mode 0 — Disabled

No Growth jobs.

### Mode 1 — Observe

- analytics/attribution only;
- no content changes;
- no Pin candidates.

### Mode 2 — Recommend

- opportunities/decisions generated;
- no autonomous site content changes;
- no publication.

### Mode 3 — Create Drafts

- autonomous translator/Ideas drafts;
- Pin candidates;
- no live site content without configured allowance.

### Mode 4 — SayTwist Autopilot + Pinterest Approval

- autonomous SayTwist-side content actions per settings;
- Pin candidates automatically created;
- operator approves each specific Pin;
- approved Pins publish at learned times.

This is the intended initial production steady state.

### Future Mode 5 — Expanded Approved Pinterest Automation

Only if Pinterest explicitly permits/approves such a workflow for this app. Requires new documented decision and security/policy review.

## 7. Controlled rollout

Recommended sequence:

1. Connect one Pinterest account.
2. Backfill analytics.
3. Enable first-party attribution.
4. Run Observe mode.
5. Compare dashboard numbers to Pinterest UI.
6. Enable Recommend mode.
7. Evaluate decision quality.
8. Enable Draft mode.
9. Test content quality/rollback.
10. Enable Pin candidates with Renderer V1.
11. Approve/publish small controlled batch.
12. Validate API/publication/analytics loop.
13. Add second/third account.
14. Enable SayTwist Autopilot + Pinterest Approval.
15. Keep close monitoring for an observation period.
16. Expand volume only when quality and conversion justify it.

## 8. Rollback

Ability to:

- disable Growth globally;
- pause a connected account;
- stop publication jobs;
- stop AI generation;
- roll back translator/Ideas edits;
- reject/cancel Pin candidates;
- disconnect Pinterest credentials.

Pausing Growth must not affect the core application.
