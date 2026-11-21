# Source Pin schedule recovery

The owner authorized automatic timing repairs on November 21, 2026. The durable
`GrowthSourceScheduleRecovery/global` activity with action
`SOURCE_SCHEDULE_RECOVERY_POLICY_UPDATED`, version 1 and `enabled: true` records
that permission. The latest policy event wins; absence, revocation, an unknown
version or a non-admin owner disables recovery. This changes scheduling permission
for already approved source Pins, not permission to approve new content.

The existing release-pinned Discord courier checks recovery at most once every
five minutes. No new timer, provider request, AI call or public message is added.
The check holds the shared portfolio lock and Growth settings row lock, requires
Growth and attribution OFF, no lease and no blocking jobs, and reads the current
eligible account rotation. It reserves only installed source dispatch times:
15:17 through 23:17 UTC, hourly. Recommendations now use the same dispatch slots.

Recovery can replace missed/unreachable source commitments and pull an already
approved future source Pin into today's remaining source allocation. It preserves
account, board, destination, exact creative, source rights, original approver and
editorial waiting period. It counts current approved allocations and pending
reviews, preserves 90-minute spacing across both channels (including actual posted
times), and retains the five-Pin ceiling. Only APPROVED rows with no claim, Pin ID
or error are eligible. PUBLISHING, FAILED and OUTCOME_UNKNOWN are never reset.

Approved snapshots remain immutable at the database layer. A transaction cancels
the original only while it is still approved and unclaimed, creates a new approved
row with the same creative and a distinct attempt key, and records
`SOURCE_SCHEDULE_REPAIRED` with the original ID, old/new time, standing consent
activity ID and `publicationAttempted: false`. The existing publisher still owns
all dispatch checks and its once-only provider claim. If it fetched the original
before repair, its conditional claim cannot match the cancelled row.

The dashboard shows automatic recovery, last check, repaired count and each
correction's old/new time. It labels a replacement as scheduled until a confirmed
Pinterest outcome exists. A missing approval or safe slot stays visible as waiting;
recovery does not manufacture consent or suppress an unresolved overdue state.

## November 21 repair

The owner's explicitly approved one-time transaction preserved the original
Patrick Jane Meme and Funny Random records as CANCELLED and created replacements
at 16:17 and 20:17 UTC (17:17 and 21:17 Algeria). It recorded two repair activities
and the standing policy, with zero Pinterest requests. The first attempt to edit
the original schedules was rejected by the immutable-snapshot trigger and fully
rolled back; no trigger or protection was disabled.
