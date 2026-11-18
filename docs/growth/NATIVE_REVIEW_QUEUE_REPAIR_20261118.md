# Native Pin review queue repair — November 18, 2026

Production release observed: `03675508086a73413de487e84ff1b1af213aa629`.

The courier repeatedly selected the oldest unoffered AI native candidate,
`cmwix1zvu000ea5svlq1fljue`, which failed read-only planning with
`PIN_PLAN_BOARD_AMBIGUOUS`. Because the native queue was sliced to one item
before attempting preparation, newer Main candidates never reached approval.
Source preparation used its separate queue and continued delivering normally.
The generic failure activity omitted the actual error code.

## Live repair

The owner requested repair and delivery of the three November 18 Main drafts.
The existing `createNativePinReview` service prepared these exact reviews;
the existing courier independently delivered each notification once (`SENT`,
attempts 1, no error):

| Candidate | Title | Review | Recommended UTC publication |
| --- | --- | --- | --- |
| cmwlrxpi2000ca59a95o7somu | 40+ Year Old Translator | cmwm2pt5g0000a57kj4mu5k91 | November 21, 14:00 |
| cmwlrygqv000va59ak4pzfgaa | 500% Drunk Translator | cmwm2pt8o0003a57kcte1ck7e | November 24, 02:00 |
| cmwlrz507001ea59a9svbdd2p | 7 Little Johnstons Translator | cmwm2ptc50006a57kw7wejbyo | November 24, 14:00 |

These were PENDING upon creation and expire November 19 around 12:04 UTC.
No owner decision or Pin publication was performed by the repair.

Today already contained three approved native allocations (02:00, 14:00,
18:00 UTC) plus an approved source allocation at 23:00 UTC. Existing daily
rotation, channel allocation, spacing and five-Pin ceiling prevented scheduling
all three new native Pins today. Those policies and approved schedules were
preserved. The table records the service's recommendations, not a claim that
these dates are the mathematically earliest possible slots.

The two older never-approved Ideas translator drafts
`cmwix1zvu000ea5svlq1fljue` and `cmwix2lyn000za5svfajzh6pz` had no board.
Each received its own account's existing active `Translator` board
`cmwi5dh5j0003a54l6wdtvgj1` under the candidate approval lock. Preconditions
required READY state, the exact account, TRANSLATOR destination, no approvals
and no pending/approved/rejected unified review. Revisions advanced 1→2;
`OWNER_REVIEW_BOARD_REPAIRED` activities retain the reason and revision evidence.
This removes the observed live missing-board blocker without granting consent.
The courier subsequently prepared and delivered the first repaired Ideas draft
at 12:06:47 UTC. The following read found zero new preparation-blocked activities
since 12:06:30 UTC; this is bounded observation, not a claim about future runs.

## Source hardening (local; not deployed)

`preparePendingOwnerReviews` now continues through the bounded native inventory
after a preparation failure until one native review succeeds. Two source offers
plus one successful native offer remain the maximum per tick. At most 30 native
and two source attempts can occur; provider publishing and AI are not invoked.
Failure activities record an allowlisted-format error code; arbitrary exception
text is replaced with `REVIEW_PREPARATION_FAILED` to avoid logging credentials.

Regression tests cover an older board failure followed by a valid draft, stopping
after one successful native offer, preserved source limits, previously offered
subjects and exception redaction. This source change requires the normal guarded
release; the deployed application files were not patched in place.

Validation: 10 focused Vitest checks across review preparation, Approval Center
authorization and courier health passed; changed-file ESLint and repository
TypeScript checking passed.
