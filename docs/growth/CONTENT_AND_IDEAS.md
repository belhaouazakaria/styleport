# Content, Ideas and Creative System

## 1. Content model

The Growth Agent can work with three primary destination experiences:

1. Translator
2. Ideas page
3. Collection/cluster page when justified

A Pin destination is chosen based on user intent, not merely what content is easiest to generate.

## 2. `/ideas`

`/ideas` is a core Growth surface, not a generic AI blog.

Its job is to satisfy Pinterest inspiration intent with original, useful, highly scannable content and then naturally introduce SayTwist tools.

Example taxonomy:

- Texting & DMs
- Dating & Relationships
- Funny Things to Say
- Captions
- Friends
- Birthdays
- Work & School
- Slang & Generations
- Comebacks
- Conversation Starters

Taxonomy should remain data-driven and may evolve.

## 3. Ideas page quality

Every published Ideas page must:

- fulfill the Pin promise;
- contain original editorial value;
- avoid padded/thin AI prose;
- be useful even if the visitor never clicks a CTA;
- include contextually relevant internal links;
- include one or more appropriate translator CTAs when useful;
- use accessible semantic markup;
- support SEO metadata;
- avoid keyword stuffing;
- avoid generating dozens of nearly identical pages.

## 4. Embedded translator experience

Where useful, an Ideas page may embed a compact translator interaction.

Example:

- input text;
- selected style;
- Twist action;
- result;
- link to full translator page.

A successful embedded translation counts as a qualified conversion.

This can outperform forcing every Ideas visitor through a second navigation step.

## 5. Content clusters

A content cluster connects:

- topic;
- existing translators;
- new translator opportunities;
- Ideas pages;
- Pinterest concepts;
- account intent;
- historical performance.

Example:

**Cluster:** Gen Z dating/texting

Translators:
- Gen Z Translator
- Flirty Reply Translator
- Dry Texter Translator

Ideas:
- 21 Flirty Replies That Do Not Sound Cringe
- What to Text After a First Date

Playground:
- Which Type of Texter Are You?
- Same Message in Five Dating Personalities

## 6. Translator autopilot

The agent may create a new translator when:

- opportunity score is sufficient;
- no equivalent translator exists;
- the concept fits SayTwist;
- it can produce a useful transformation behavior;
- category/taxonomy fit is valid;
- content quality gates pass.

It may edit an existing translator when:

- evidence suggests a material improvement;
- changes preserve the translator's core intent;
- version history is created;
- rollback remains possible.

Slug changes should be exceptional and require redirect handling.

## 7. Creative system

The existing SayTwist automatic Pin image generator becomes:

**Renderer V1 — Control**

Do not replace it before measuring it.

Additional static-image archetypes may be introduced experimentally:

- Typography-led
- Before/after transformation
- Editorial/list
- Conversation/chat layout
- Comparison
- Quiz/personality-style
- Minimal statement
- Scene-based visual, if image generation is justified

Video is out of scope initially.

## 8. Creative experiments

Each Pin candidate records:

- renderer version;
- template ID;
- content archetype;
- headline pattern;
- CTA pattern;
- visual treatment;
- topic;
- account;
- destination;
- scheduled time.

Outcomes attach to the exact creative metadata.

The agent should learn which archetype works for which topic and account rather than naming a single universal "best design."

## 9. AI image economics

Do not generate an expensive image merely because image generation is available.

Prefer, in order:

1. proven deterministic renderer/template;
2. reusable approved visual assets;
3. generated imagery when visual novelty is expected to add value.

Track generated-image cost separately.

## 10. Duplicate/similarity controls

Before a Pin candidate enters approval:

- compare headline similarity;
- compare destination/content intent;
- compare recent publication history;
- compare image/template fingerprints where practical;
- prevent repeated identical concepts across accounts;
- flag borderline cases.

The purpose is quality and authenticity, not evading detection.

## 11. CTA strategy

CTAs must match the experience.

Translator:
- Try it with your own text
- Twist your message
- See how your sentence sounds

Ideas:
- See all ideas
- Try these with your own message
- Get more examples

Playground:
- Try your own sentence
- See your style
- Explore the full version

Avoid deceptive clickbait where the destination cannot satisfy the claim.

## Repository integration

Phase 9 implements `GrowthIdea`, immutable `GrowthIdeaVersion`, `GrowthIdeaTranslatorReference`, and a separate seeded `GrowthIdeaCategory` taxonomy rather than repurposing Translator categories or editorial rows. `/ideas` provides bounded category filtering and pagination; `/ideas/[slug]` renders only strict structured blocks, canonical metadata, breadcrumbs, related Ideas, contextual Translator links, and at most one compact embedded Translator through the existing `/api/translate`. Public queries require published, non-archived Ideas and current versions; the sitemap applies the same rule, and dynamic reads avoid retaining unpublished or replaced versions in a page cache.

Generation uses bounded untrusted evidence, an injectable provider, strict JSON, and at most one repair. Deterministic validation enforces the block allowlist, 96 KiB snapshot maximum, SEO and depth bounds, normalized list-item dedupe, numeric-title item counts, valid links, active Translator references, limited CTA ratio, and material change on improvement. Create/improve planning thresholds are 70/75 and 65/70 for opportunity score/confidence. Dedupe considers title, slug, category, cluster, and list-item fingerprints. Successful explicitly invoked execution publishes automatically only after all server checks and late revalidation pass. Archive and checksum-protected rollback are audited; rollback appends a version. Renderer V1 and user result shares remain separate Phase 10 concerns.
