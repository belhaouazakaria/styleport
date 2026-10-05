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

`/ideas` does not exist today. Use `GrowthIdea`, `GrowthIdeaVersion` and separate Ideas categories rather than repurposing translator categories/editorial rows. Public pages go under `app/(public)/ideas/*`, with metadata and `app/sitemap.ts` integration. Contextual CTAs and embedded translations must use the existing translation API, while Phase 5 adds nonblocking attribution hooks. Do not expose unpublished versions. `lib/share-images.tsx` is Renderer V1 — Control for translator creatives; user result shares in `translator-card.tsx` are a separate temporary flow. No new renderer or video is part of Phase 1.
