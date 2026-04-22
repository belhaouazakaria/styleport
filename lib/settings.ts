import {
  APP_NAME,
  APP_SETTING_KEYS,
  DEFAULT_AUTO_FEATURED_WINDOW_DAYS,
  DISCOVERY_DEFAULT_PAGE_SIZE,
} from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import type { AppSettings } from "@/lib/types";

const SETTINGS_CACHE_TTL_MS = 15_000;

const defaultSettings: AppSettings = {
  platformName: APP_NAME,
  homepageTitle: "Discover Translators for Every Style",
  homepageSubtitle:
    "Browse and use specialized AI translators for tone, voice, and creative transformation.",
  catalogIntro:
    "Search by style, category, or intent to find the right translator in seconds.",
  footerDisclaimer:
    "StylePort provides AI-assisted rewriting for drafting purposes. Always review outputs before critical use.",
  defaultTranslatorSlug: "regal-rewrite",
  featuredTranslatorsEnabled: true,
  autoFeaturedEnabled: true,
  autoFeaturedWindowDays: DEFAULT_AUTO_FEATURED_WINDOW_DAYS,
  autoFeaturedLastRecalculatedAt: null,
  defaultModelOverride: "",
  discoveryPageSize: DISCOVERY_DEFAULT_PAGE_SIZE,
  adsEnabled: false,
  adSenseClientId: "",
};

let appSettingsCache:
  | {
      expiresAt: number;
      value: AppSettings;
    }
  | null = null;
let appSettingsInFlight: Promise<AppSettings> | null = null;

function mapRowsToSettings(rows: Array<{ key: string; value: unknown }>): AppSettings {
  const map = new Map(rows.map((row) => [row.key, row.value]));

  return {
    platformName: (map.get(APP_SETTING_KEYS.PLATFORM_NAME) as string) || defaultSettings.platformName,
    homepageTitle:
      (map.get(APP_SETTING_KEYS.HOMEPAGE_TITLE) as string) || defaultSettings.homepageTitle,
    homepageSubtitle:
      (map.get(APP_SETTING_KEYS.HOMEPAGE_SUBTITLE) as string) || defaultSettings.homepageSubtitle,
    catalogIntro: (map.get(APP_SETTING_KEYS.CATALOG_INTRO) as string) || defaultSettings.catalogIntro,
    footerDisclaimer:
      (map.get(APP_SETTING_KEYS.FOOTER_DISCLAIMER) as string) || defaultSettings.footerDisclaimer,
    defaultTranslatorSlug:
      (map.get(APP_SETTING_KEYS.DEFAULT_TRANSLATOR_SLUG) as string) ||
      defaultSettings.defaultTranslatorSlug,
    featuredTranslatorsEnabled:
      typeof map.get(APP_SETTING_KEYS.FEATURED_TRANSLATORS_ENABLED) === "boolean"
        ? (map.get(APP_SETTING_KEYS.FEATURED_TRANSLATORS_ENABLED) as boolean)
        : defaultSettings.featuredTranslatorsEnabled,
    autoFeaturedEnabled:
      typeof map.get(APP_SETTING_KEYS.AUTO_FEATURED_ENABLED) === "boolean"
        ? (map.get(APP_SETTING_KEYS.AUTO_FEATURED_ENABLED) as boolean)
        : defaultSettings.autoFeaturedEnabled,
    autoFeaturedWindowDays:
      typeof map.get(APP_SETTING_KEYS.AUTO_FEATURED_WINDOW_DAYS) === "number"
        ? (map.get(APP_SETTING_KEYS.AUTO_FEATURED_WINDOW_DAYS) as number)
        : defaultSettings.autoFeaturedWindowDays,
    autoFeaturedLastRecalculatedAt:
      typeof map.get(APP_SETTING_KEYS.AUTO_FEATURED_LAST_RECALCULATED_AT) === "string"
        ? (map.get(APP_SETTING_KEYS.AUTO_FEATURED_LAST_RECALCULATED_AT) as string)
        : defaultSettings.autoFeaturedLastRecalculatedAt,
    defaultModelOverride:
      (map.get(APP_SETTING_KEYS.DEFAULT_MODEL_OVERRIDE) as string) ||
      defaultSettings.defaultModelOverride,
    discoveryPageSize:
      typeof map.get(APP_SETTING_KEYS.DISCOVERY_PAGE_SIZE) === "number"
        ? (map.get(APP_SETTING_KEYS.DISCOVERY_PAGE_SIZE) as number)
        : defaultSettings.discoveryPageSize,
    adsEnabled:
      typeof map.get(APP_SETTING_KEYS.ADS_ENABLED) === "boolean"
        ? (map.get(APP_SETTING_KEYS.ADS_ENABLED) as boolean)
        : defaultSettings.adsEnabled,
    adSenseClientId:
      (map.get(APP_SETTING_KEYS.ADSENSE_CLIENT_ID) as string) || defaultSettings.adSenseClientId,
  };
}

export function invalidateAppSettingsCache() {
  appSettingsCache = null;
}

export async function getAppSettings(options?: { forceRefresh?: boolean }): Promise<AppSettings> {
  const forceRefresh = options?.forceRefresh === true;
  const now = Date.now();

  if (!forceRefresh && appSettingsCache && appSettingsCache.expiresAt > now) {
    return appSettingsCache.value;
  }

  if (!forceRefresh && appSettingsInFlight) {
    return appSettingsInFlight;
  }

  const task = prisma.appSetting
    .findMany()
    .then((rows) => {
      const value = mapRowsToSettings(rows);
      appSettingsCache = {
        value,
        expiresAt: Date.now() + SETTINGS_CACHE_TTL_MS,
      };
      return value;
    })
    .finally(() => {
      if (appSettingsInFlight === task) {
        appSettingsInFlight = null;
      }
    });

  appSettingsInFlight = task;
  return task;
}

export async function updateAppSettings(settings: AppSettings): Promise<void> {
  const entries = [
    [APP_SETTING_KEYS.PLATFORM_NAME, settings.platformName],
    [APP_SETTING_KEYS.HOMEPAGE_TITLE, settings.homepageTitle],
    [APP_SETTING_KEYS.HOMEPAGE_SUBTITLE, settings.homepageSubtitle],
    [APP_SETTING_KEYS.CATALOG_INTRO, settings.catalogIntro],
    [APP_SETTING_KEYS.FOOTER_DISCLAIMER, settings.footerDisclaimer],
    [APP_SETTING_KEYS.DEFAULT_TRANSLATOR_SLUG, settings.defaultTranslatorSlug],
    [APP_SETTING_KEYS.FEATURED_TRANSLATORS_ENABLED, settings.featuredTranslatorsEnabled],
    [APP_SETTING_KEYS.AUTO_FEATURED_ENABLED, settings.autoFeaturedEnabled],
    [APP_SETTING_KEYS.AUTO_FEATURED_WINDOW_DAYS, settings.autoFeaturedWindowDays],
    [
      APP_SETTING_KEYS.AUTO_FEATURED_LAST_RECALCULATED_AT,
      settings.autoFeaturedLastRecalculatedAt || "",
    ],
    [APP_SETTING_KEYS.DEFAULT_MODEL_OVERRIDE, settings.defaultModelOverride],
    [APP_SETTING_KEYS.DISCOVERY_PAGE_SIZE, settings.discoveryPageSize],
    [APP_SETTING_KEYS.ADS_ENABLED, settings.adsEnabled],
    [APP_SETTING_KEYS.ADSENSE_CLIENT_ID, settings.adSenseClientId],
  ] as const;

  await prisma.$transaction(
    entries.map(([key, value]) =>
      prisma.appSetting.upsert({
        where: { key },
        update: { value },
        create: { key, value },
      }),
    ),
  );

  invalidateAppSettingsCache();
}
