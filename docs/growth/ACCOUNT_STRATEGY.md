# Pinterest Account Strategy

## 1. Strategy principle

Accounts are separated by **Pinterest user intent and editorial experience**, not prematurely by narrow translator categories.

Do not create an account merely because a category exists in SayTwist.

The three initial intent classes are:

- Utility: "I want a tool."
- Inspiration: "I need ideas."
- Entertainment: "I want something fun/shareable."

## 2. Initial account portfolio

### 2.1 SayTwist

**Intent:** Utility and discovery  
**Role:** Main brand account and primary direct translator distribution account.  
**Primary destinations:** `/translators/*` and selected `/ideas/*`.  
**Domain claim:** `saytwist.com` is already claimed by this main account.

Typical Pin concepts:

- Turn any text into Gen Z slang.
- Make this message ridiculously formal.
- Rewrite a boring text into something funnier.
- How would Shakespeare say this?
- Try the newest translator.
- Direct before/after transformation concepts.

This account is the natural home for existing translator Pin generation.

### 2.2 SayTwist Ideas

**Intent:** Inspiration and saving  
**Role:** Useful, save-worthy idea content that solves a broader need before introducing the translator tools.  
**Primary destination:** `/ideas/*`.

Typical content:

- 25 funny ways to say good morning.
- What to text when you do not know what to say.
- Flirty replies that do not feel forced.
- Different ways to say "I miss you."
- Birthday message ideas.
- Funny alternatives to "okay."
- Conversation starters.
- Caption and bio ideas.

The Ideas page fulfills the Pinterest promise first, then exposes contextual translator CTAs or embedded translator experiences.

### 2.3 SayTwist Playground

**Intent:** Entertainment, identity, sharing and curiosity  
**Role:** Playful language content with a strong viral/shareable angle.  
**Primary destination:** `/ideas/*`, interactive editorial pages or relevant translators.

Typical concepts:

- Which texting personality are you?
- One sentence in five generations.
- How would five personalities say "leave me alone"?
- Can you decode this Gen Alpha sentence?
- Same breakup message in six styles.
- Pick a reply and discover your texting style.

The Pin must itself be useful or entertaining; the destination deepens the experience.

## 3. Cross-account topic reuse

The same topic may exist across publications only when the user intent and content execution differ materially.

Example winning signal: **Gen Z + dating + texting**

Valid expansion:

- SayTwist -> "Gen Z Flirting Translator" -> translator page.
- SayTwist Ideas -> "21 Flirty Replies That Do Not Sound Cringe" -> Ideas page.
- SayTwist Playground -> "Which Gen Z Flirting Style Are You?" -> entertainment page.

Invalid expansion:

- same title;
- same image with changed colors;
- same destination;
- same copy;
- same concept;
- posted repeatedly across accounts to increase distribution.

## 4. Account authenticity

Every account must have:

- a clear editorial purpose;
- its own profile positioning;
- relevant boards;
- a content mix that makes sense to a human follower;
- original Pin concepts;
- publishing decisions based on relevance rather than quota.

Multiple accounts must never be used to manipulate Pinterest metrics or evade distribution limits.

## 5. Domain claim

Current Pinterest guidance allows a website to be claimed by only one Pinterest account.

Plan:

- retain the existing `saytwist.com` claim on the main SayTwist account;
- do not create artificial subdomains solely to manufacture separate domain claims;
- satellite publications may link to relevant SayTwist pages without pretending to be separate businesses.

If Pinterest rules change, update this document before implementation changes.

## 6. Account expansion model

Start with three accounts.

Once per month, the agent produces an **Account Opportunity Review**.

Potential recommendation types:

- keep portfolio unchanged;
- reposition an account;
- merge/retire an editorial concept;
- recommend a new specialized account.

The agent never creates the account automatically.

### Evidence required before recommending a new account

A candidate niche should demonstrate:

- sustained qualified conversions;
- enough content inventory to support a real publication;
- multiple distinct content concepts;
- stable performance over several weeks;
- strong saves/clicks/conversions relative to portfolio baseline;
- low dependence on one anomalous Pin;
- a clear editorial identity different from existing accounts.

Example future possibilities, only if data earns them:

- SayTwist Texting
- SayTwist Captions
- SayTwist Words
- relationship-focused publication
- another content vertical discovered by data

## 7. Boards

Boards are an editorial taxonomy inside each account, not a substitute for account identity.

The agent may recommend/create boards through approved API capabilities where allowed, but board creation must remain aligned with the account's purpose.

Board performance should be measurable but should not override page-level and conversion-level metrics.

## 8. Account recommendation output

Monthly report example:

- Current accounts: 3
- Recommendation: remain at 3
- Reason: no fourth cluster has sufficient sustainable content depth
- Highest emerging cluster: relationship/texting
- Share of qualified Pinterest conversions: 41%
- Confidence in spin-out recommendation: 64%
- Minimum threshold for recommendation: 80%

The operator decides whether to create/connect any recommended new account.

## Launch inventory and targeting

The two additional accounts already exist and will later be rebranded SayTwist Ideas and SayTwist Playground. Launch requires connection/rebranding, not creation. Start with three accounts. Worldwide English is the audience; cold-start scheduling/content tests prioritize US signals, then first-party performance controls the mix. A winning topic may yield a direct translator tool Pin on SayTwist, a useful save-worthy `/ideas` list on Ideas, and a genuinely interactive/relatable concept on Playground, each with distinct creative, copy and destination value. Similarity checks prevent superficial cross-posting.

Phase 3 models the roles as `SAYTWIST`, `SAYTWIST_IDEAS` and `SAYTWIST_PLAYGROUND`. PostgreSQL permits only one connected account per active role and one record per Pinterest account ID. Role changes are explicit audited admin actions. Disconnect retains historical role metadata but releases the active slot and never assigns another account automatically.
