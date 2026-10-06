import { getServerEnv } from "@/lib/env";
import { defaultGrowthSettings, getGrowthSettings } from "@/lib/growth/settings";

export type AttributionCollectionState = "DISABLED_BY_SERVER" | "DISABLED_BY_GROWTH_SETTING" | "ENABLED";

export function isAttributionEnvironmentEnabled() {
  return getServerEnv().GROWTH_ATTRIBUTION_COLLECTION_ENABLED === true;
}

export async function getAttributionCollectionStatus(options?: { readSettingWhenServerDisabled?: boolean }) {
  const environmentEnabled = isAttributionEnvironmentEnabled();
  const settings = environmentEnabled || options?.readSettingWhenServerDisabled
    ? await getGrowthSettings()
    : defaultGrowthSettings;
  const state: AttributionCollectionState = !environmentEnabled
    ? "DISABLED_BY_SERVER"
    : !settings.attributionEnabled
      ? "DISABLED_BY_GROWTH_SETTING"
      : "ENABLED";

  return {
    environmentEnabled,
    settingEnabled: settings.attributionEnabled,
    enabled: state === "ENABLED",
    state,
    settings,
  };
}

export async function isAttributionCollectionEnabled() {
  if (!isAttributionEnvironmentEnabled()) return false;
  const settings = await getGrowthSettings();
  return settings.attributionEnabled;
}
