-- Update AppSetting table with SayTwist brand values
-- This fixes the "What Type Of | Translator" issue by updating the database directly

INSERT INTO "AppSetting" ("id", "key", "value", "updatedAt")
VALUES
  ('cltsaytwist001', 'platformName', '"SayTwist"', CURRENT_TIMESTAMP),
  ('cltsaytwist002', 'homepageTitle', '"Give Your Words a Different Twist"', CURRENT_TIMESTAMP),
  ('cltsaytwist003', 'homepageSubtitle', '"Browse specialized AI translators for every tone, voice, and creative style. Find the perfect twist for your text."', CURRENT_TIMESTAMP),
  ('cltsaytwist004', 'catalogIntro', '"Search by style, category, or intent to discover the right translator for your next rewrite."', CURRENT_TIMESTAMP),
  ('cltsaytwist005', 'footerDisclaimer', '"SayTwist provides AI-assisted rewriting for drafting purposes. Always review outputs before critical use."', CURRENT_TIMESTAMP)
ON CONFLICT ("key")
DO UPDATE SET
  "value" = EXCLUDED."value",
  "updatedAt" = CURRENT_TIMESTAMP;