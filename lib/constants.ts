export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "StylePort";
export const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";

export const MAX_INPUT_CHARS = 5000;
export const OCR_MAX_FILE_SIZE_MB = 8;

export const ALLOWED_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
] as const;

export const RATE_LIMIT_WINDOW_MS = 60_000;
export const RATE_LIMIT_MAX_REQUESTS = 20;

export const SEO_DESCRIPTION =
  "StylePort is a discovery platform for style translators, tone converters, and creative text rewrites.";

export const DISCOVERY_DEFAULT_PAGE_SIZE = 12;
export const DISCOVERY_SUGGESTION_LIMIT = 8;

export const APP_SETTING_KEYS = {
  PLATFORM_NAME: "platformName",
  HOMEPAGE_TITLE: "homepageTitle",
  HOMEPAGE_SUBTITLE: "homepageSubtitle",
  FOOTER_DISCLAIMER: "footerDisclaimer",
  DEFAULT_TRANSLATOR_SLUG: "defaultTranslatorSlug",
  FEATURED_TRANSLATORS_ENABLED: "featuredTranslatorsEnabled",
  DEFAULT_MODEL_OVERRIDE: "defaultModelOverride",
  DISCOVERY_PAGE_SIZE: "discoveryPageSize",
  ADS_ENABLED: "adsEnabled",
  ADSENSE_CLIENT_ID: "adSenseClientId",
  CATALOG_INTRO: "catalogIntro",
} as const;

export const DEFAULT_CATEGORY_SLUGS = [
  "fancy",
  "funny",
  "professional",
  "historical",
  "roleplay",
  "casual",
  "social",
  "marketing",
] as const;

export const AD_PLACEMENT_KEYS = [
  "homepage_top",
  "homepage_between_sections",
  "translator_above_tool",
  "translator_below_tool",
  "sidebar_slot",
  "footer_slot",
  "mobile_sticky_slot",
] as const;

export const MODEL_LIST_FALLBACK = [
  "gpt-4.1-mini",
  "gpt-4.1",
  "gpt-4o-mini",
  "gpt-4o",
  "gpt-5-mini",
  "gpt-5",
] as const;

export const USAGE_PROTECTION_STATE_ID = "global";
export const DEFAULT_IP_LIMIT_PER_MINUTE = 5;
export const DEFAULT_IP_LIMIT_PER_HOUR = 50;
export const DEFAULT_IP_LIMIT_PER_DAY = 200;
export const DEFAULT_GLOBAL_DAILY_TOKEN_CAP = 200_000;
