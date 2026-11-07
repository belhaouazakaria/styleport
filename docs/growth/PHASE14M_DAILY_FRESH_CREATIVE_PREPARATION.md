# Phase 14M: daily AI-generated Pinterest creative preparation

**Status (November 7, 2026):** Updated on feature branch feat/phase14m-ai-image-creatives; NOT merged, deployed, tested live or enabled. Production SHA 12b62c4969685a5ffc052aa6d97170fa578374e1 has the Phase14L five-minute publisher active, but its older deterministic Phase14M generator has never been installed or enabled. The owner specifically requires **original fully AI-generated creatives**, not static template posters.

## Scope and quality

At 07:02 UTC, prepare new 2:3 Pinterest images for active Translators using the existing Creative Lab **BEFORE_AFTER** full-image AI renderer. GPT Image 2 designs the complete background, layout, typography, illustrative elements, headline, transformation proof and CTA. The app uses a saved Translator before/after example as trustworthy copy evidence without paying for another text-model call. The existing controlled art directions vary across editorial split, chat focus, bold poster, collage and magazine frame.

The original image is 1024x1536, normalized to a validated 1000x1500 PNG. The candidate must be READY with AI provider/model provenance. The owner must review accuracy, visual quality, text spelling, board, destination and schedule and independently approve every Pin before publication. Draft generation never publishes or modifies Translators/Ideas.

## Selection and budgets

- Exactly one connected production Pinterest account with four read/write scopes and an active board. No Pinterest calls or Pinterest credentials during AI generation.
- Active, unarchived Translators with a meaningful first TranslatorEditorialExample before/after pair (not merely a TranslatorExample entry), a nontrivial description of at least 40 characters, and zero prior Pin candidates. Never recycle the old gallery.
- Existing owner PAUSED/FIXED/AUTO controls. In AUTO, one original daily creative when performance evidence is uncertain, increasing to at most three only when local intelligence has recent KNOWN opportunities. Hard maximum three candidates/images per UTC day; other candidates created that day count toward the total.
- Fixed model gpt-image-2, quality medium, 1024x1536, one attempt per exact job, no SDK retries, provider timeout 180 seconds. Existing price admission conservatively reserves **$0.30** per image before a request; approximate published output price for this shape is $0.041 plus text input. Reservation is not actual billed spend. Unknown prices, models and repeated attempts fail closed.
- Shared GrowthSettings hard caps, default **$2/day, $30/month and 3 images/day**, enforced using the immutable budget reservation ledger. Production settings may be different and must be read before live approval. No fallback to site-wide OpenAI credentials; require separately scoped Growth API key and project.
- One exact CREATIVE_LAB_GENERATE job per draft, maxAttempts=1, a short 270-second expiring Growth activation lease and independent watchdog. No generic worker, background AI content creation, attribution, Telegram, or automatic Pinterest approval.

## Runtime safety

The private root-owned 0700 install-growth-daily-fresh-systemd.sh installs a 07:02 UTC one-shot service, calendar timer and private throttled failure alert, all disabled by default. Its child gets only private loopback DB, dedicated Growth API key/project and a fixed image model, never Pinterest secrets. The runner prints only safe bounded status codes. Batch ceiling is three sequential AI calls; systemd service limit 900 seconds.

The launcher is allowed in SCHEDULED mode between 07:02 and 07:15 UTC. A separate owner-authorized TRIAL outside that window requires an exact SHA-bound approval string RUN SAYTWIST DAILY FRESH TRIAL followed by the deployed SHA. Trial generates and bills for a real image, it is not a free dry-run. Never rerun an ambiguous provider call without financial evidence.

## Protected release and launch gates

This revision needs a new exact-SHA production release. **Four** currently live SHA-pinned timers must be coordinated (watchdog, daily OBSERVE, local intelligence and Phase14L approved publisher), not merely the original three.

1. Pass PR lint, typecheck, full tests, build, shell syntax and budget/security review. Confirm no new DB migrations.
2. Owner-controlled root timer hold: disable+stop publisher, intelligence and OBSERVE; stop watchdog timer but leave watchdog enabled; assert Growth OFF and lease NULL. Manually deploy exact new GitHub main HEAD using deploy-hostinger.yml (backup, no migration drift, health and rollback).
3. Rotate watchdog, OBSERVE and intelligence by their audited SHA-pinned scripts; independently restore all three old timers. Use the new reviewed private root-owned 0700 rotate-growth-approved-publisher-release-systemd.sh to rotate the publisher unit while its timer remains disabled. Perform one IDLE test, then restore five-minute publisher timer.
4. Install revised Phase14M service/timer disabled and inspect its pinned SHA, private alert, live budget settings, account scopes, price profile and eligible targets.
5. With explicit owner authorization for a paid experiment, run one off-calendar TRIAL generating an AI image. Verify one new READY candidate with AI provenance, no Pinterest request or publication, the expected durable budget reservation, Growth OFF, lease NULL, no orphan Growth job, and the creative actually looks correct.
6. Owner reviews the image in Creative Lab and approves an exact future time, account and board. Verify the live Phase14L five-minute publisher creates **one** Pin with an authoritative Pin ID and reconciled status, no duplicate POST, no stray job, and the 4/hour 16/day Pinterest ceiling.
7. Only after the Pin acceptance, separately authorize recurring paid work and enable the Phase14M daily-fresh timer. Audit the next run against content quality, daily cap, budgets, provider effects and private alert. Fail closed and stop new timer on anomaly.

## Full-live distinction

The Phase14L + Phase14M loop is approval-based organic Pinterest automation. Full Growth also needs automatic provider reconciliation, first-party attribution with consent, daily private Telegram reports, paid content intelligence, autonomous Translator/Idea editorial controls and Pinterest board lifecycle management. Those remain independent launch gates.
