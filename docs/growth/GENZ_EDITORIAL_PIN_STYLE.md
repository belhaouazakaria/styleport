# Gen-Z Editorial for the main SayTwist account

`genz_editorial` is the account-aware default for new main-account (`SAYTWIST`, @saytwist) designs. Ideas and Playground retain their existing AI styles. Explicit legacy style selections are respected on Main. Historical jobs lacking a style retain their existing behavior. Existing assets, published Pins, destinations, schedules, approvals and spending limits are unchanged. No schema migration is needed for this feature.

## Entry points and account scope

Paid Gen-Z generation has its own `GROWTH_GENZ_AI_IMAGE_ENABLED` switch, separate from the generic AI image switch. Production enables this concept without changing the generic flag. The daily fresh worker keeps its existing one-attempt job, image budget, and exact-job lease; every Pin remains pending owner review.

- Creative Lab defaults to the main account when available and selects Gen-Z Editorial. Choosing another account selects its existing style. Existing poster and before/after choices remain available. Stroke percentage, WebP quality, gallery preview, WebP download and explicit regeneration use existing controls and routes.
- New API requests with an account but no archetype/style resolve the account default. Old requests with an explicit archetype keep that choice unless they explicitly request `designStyle: "genz_editorial"`.
- The scheduled fresh worker requests the account default. Main does not require a before/after example for photography. Other accounts retain their existing example requirements. Existing unassociated/experiment recommendations keep their explicit archetype until an account/style is selected; no account is invented.
- Main-account source spotlights use the same photographic renderer with a small, separately rendered SayTwist wordmark in the upper-left safe region. Their public copy is SayTwist-only; source lineage and original destinations remain internal and explicit in approval records. Source descriptions and original AnythingTranslate destinations remain intact. Other source accounts use their existing AI designs. Main-only source artwork is recorded in the existing preparation audit event.
- Native and source approval checks, Admin account choices and Discord choices prohibit moving a Gen-Z design to Ideas or Playground. Choices do not approve a Pin. A source review can propose a uniquely named Translators board on Main; owner approval remains required.

## One AI image request, no additional planning call

`buildGenZBackgroundPrompt` quotes the actual display name, description, category, purpose and tone as data. The existing Growth image model privately plans subject, environment, objects, atmosphere, lighting and perspective, then generates photography in the same request. There are no translator-to-scene mappings. Different translator metadata produces different prompts.

The prompt requires a candid, nostalgic Pinterest/Tumblr photographic treatment suited to the individual concept, including believable photography for imagined subjects. Main subjects occupy the upper/middle frame; the lower region remains textured and meaningful. Text, logos, captions, overlays, collages and borders are prohibited in the AI background. All visible lettering is added separately by the application. The current headline format is `Click to translate your text with {display name}`, rather than the name alone. This copy is deterministic and requires no extra model call.

The existing isolated Growth provider, conservative price reservation, usage ledger, one-image admission, provider timeout and no-blind-retry behavior remain in use. The font, permission, glyph support and headline fit are validated before paid dispatch. A generation failure preserves prior successful assets and never substitutes another design or font.

## Actual Upright font and deployment prerequisite

The supplied live endpoint did not respond. The original file was recovered through the Internet Archive's capture selector for the same URL:

- Original: `http://design.whisper.sh/assets/resources/fonts/Upright/Upright.otf`
- Archived selector: `https://web.archive.org/web/20230901000000id_/http://design.whisper.sh/assets/resources/fonts/Upright/Upright.otf`
- Family: Upright; subfamily: Regular; PostScript name: Upright; 347 glyphs.
- SHA-256: `b4a4e229e398cee333082204aedcfc5a2f7cff1537420381983fd7c439c95824`.
- Embedded notice: Copyright (c) 2009 by John Lopez. All rights reserved.

The owner identified the archived Whisper asset above as the intended font and confirmed that it needs no separate commercial-use license. We downloaded that archived file and verified its SHA-256 matches the privately uploaded font exactly. This confirmation is scoped to the pinned checksum; a different font with the same family name still needs its own permission record. The font remains in ignored private runtime storage and is not redistributed in Git or served to browsers. No substitute font is bundled.

Install the checksum-verified original privately at `storage/fonts/upright/Upright.otf`. Optional operator environment variables are `GROWTH_UPRIGHT_FONT_PATH`, `GROWTH_UPRIGHT_FONT_SHA256` and `GROWTH_UPRIGHT_FONT_PERMISSION_PATH`. A separately supplied font variant must still identify itself as Upright Regular, have its expected checksum explicitly configured, and include its own permission record. Configure these values for both the web application and isolated fresh worker if overriding the default paths; the fresh launcher forwards only these specific font settings.

For a different font variant, record its permission reference in the private permission file next to the font. The following is an intentionally disabled example:

```json
{
  "fontSha256": "b4a4e229e398cee333082204aedcfc5a2f7cff1537420381983fd7c439c95824",
  "commercialRenderingAuthorized": false,
  "licenseReference": ""
}
```

The exact reference font SHA above does not require that separate file; all other variants retain the permission check. Preview mode remains available for layout evaluation.

## Typography and compositing

`genzTypographySchema` defaults to 250% stroke and WebP quality 92. Supported ranges are 180–300% and integer quality 90–95. Adjust the values in Creative Lab or pass `strokeWidthPercent` and `webpQuality` with a generation request. No renderer edit is needed.

The baseline stroke is 3% of font size. Effective SVG stroke width is `fontSize * 0.03 * (percent / 100)`, e.g. 12 pixels at 160 pixels and 250%. This is not a 250-pixel outline. The centered stroke is drawn behind the complete white glyph fill, so the inner part does not reduce the lettering. Rounded joins are used. There is no default shadow because the outline provides the primary contrast.

Fontkit shapes the actual OpenType glyphs with kerning and positions. The renderer creates vector paths from those glyphs; it does not rely on a system font, SVG font-family fallback or a screenshot browser. It measures ink bounds and stroke extents, finds balanced word breaks, starts at 170 pixels, and reduces size only as needed. One to four lines are supported. The default lower region is y=980–1410 with 70-pixel horizontal safe margins. Short blocks are centered vertically in that region; long blocks can move upward. No words are dropped or ellipsized from the image. Unsupported glyphs and unrepresentable titles fail explicitly before generation. Names are NFC-normalized; em dashes are replaced with plain hyphens.

The photograph is normalized to 1000×1500 with aspect-preserving crop. A transparent glyph overlay is composited onto it. Both PNG and high-quality WebP are exported. The existing publisher and immutable approval snapshots keep the PNG compatibility asset. WebP has its own checksum-addressed immutable file, is associated with its candidate through the existing generation audit event, and can be downloaded from the gallery. Its media route serves `image/webp`; existing PNG URLs remain `image/png`.

## Caching and regeneration

Cache identity includes translator content, name/category, design version, font checksum, stroke and export configuration. The candidate records use existing renderer/version/template fields and the job JSON payload. No existing record or bitmap is overwritten.

Normal repeated generation may reuse the same successful composition for identical identity/configuration. Explicit Gen-Z regeneration uses a fresh nonce and a new one-attempt job, preserving the old candidate/asset and requesting a new AI photograph. Existing idempotency and failure controls remain. A retry of the same execution cannot spend twice. Duplicate/similarity and owner approval gates still apply to the new candidate.

## Restore the earlier default

Select an existing style in Creative Lab, or send `designStyle: "legacy"` for an individual request. To restore the main-account automatic default, set `GROWTH_MAIN_PIN_DESIGN_STYLE=legacy` in the web application's runtime and the isolated fresh worker's root-owned service environment, using the normal protected configuration/release procedure. The default is `genz_editorial`; only these two values are accepted. Captured queued styles and existing Pins do not change. Ideas and Playground are unaffected by this setting.

## Validation

The suite covers account-aware defaults, legacy selection, metadata-dependent prompts, no AI typography, exact font checks, stroke conversion/ranges, real glyph geometry, long names, unsupported Unicode, safe margins, PNG/WebP formats, immutable storage, generation failure, explicit regeneration, and cross-account review rejection. Real-font tests use the operator's private file; clean CI skips those cases when the binary is absent. Local validation ran with the actual font.

The controlled visual set uses two built-in ImageGen backgrounds: Cat Translator and Shakespearean English Translator for Everyday Messages. The initial application validation rendered each at 180%, 190% and 200% into PNG and WebP under ignored `output/genz-editorial/`; `validation.json` records exact bounds and checksums. The revised v2 previews use the same photographs with the invitation copy and a heavier 250% outline; 300% is also supported. The renderer version changed to invalidate old composition caches while preserving existing assets. No additional AI photograph requests were needed. No live Growth API key, production data, publishing approval or production deployment was used for these previews.
