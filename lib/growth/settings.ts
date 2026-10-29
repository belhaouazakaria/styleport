import { GrowthActivityActorKind, GrowthIntensity } from "@prisma/client";

import {
  DEFAULT_GROWTH_WORKER_BATCH_SIZE,
  DEFAULT_ATTRIBUTION_EVENT_RETENTION_DAYS,
  DEFAULT_ATTRIBUTION_SESSION_RETENTION_DAYS,
  DEFAULT_ATTRIBUTION_WINDOW_DAYS,
  GROWTH_SETTINGS_ID,
  growthSettingsSchema,
  type GrowthSettingsInput,
} from "@/lib/growth/contracts";
import { recordGrowthActivity } from "@/lib/growth/activity";
import { DEFAULT_OWNED_PINTEREST_DOMAINS, reclassifyPinterestPins } from "@/lib/growth/pinterest/relevance";
import { prisma } from "@/lib/prisma";
import { DEFAULT_EVERGREEN_COOLDOWN_DAYS } from "@/lib/growth/learning/constants";

export const defaultGrowthSettings = {
  id: GROWTH_SETTINGS_ID,
  enabled: false,
  workerActivationExpiresAt: null,
  intensity: GrowthIntensity.BALANCED,
  workerBatchSize: DEFAULT_GROWTH_WORKER_BATCH_SIZE,
  ownedDomains: [...DEFAULT_OWNED_PINTEREST_DOMAINS],
  attributionEnabled: false,
  attributionWindowDays: DEFAULT_ATTRIBUTION_WINDOW_DAYS,
  attributionSessionRetentionDays: DEFAULT_ATTRIBUTION_SESSION_RETENTION_DAYS,
  attributionEventRetentionDays: DEFAULT_ATTRIBUTION_EVENT_RETENTION_DAYS,
  evergreenCooldownDays: DEFAULT_EVERGREEN_COOLDOWN_DAYS,
  aiDailyBudgetCents: 200,
  aiMonthlyBudgetCents: 3000,
  aiImagesPerDayCap: 3,
  translatorCreatesPerDayCap: 1,
  translatorUpdatesPerDayCap: 3,
  ideaCreatesPerWeekCap: 2,
  configVersion: 1,
  updatedById: null,
  createdAt: null,
  updatedAt: null,
} as const;

export async function getGrowthSettings() {
  return (await prisma.growthSettings.findUnique({ where: { id: GROWTH_SETTINGS_ID } })) || defaultGrowthSettings;
}

export async function updateGrowthSettings(input: GrowthSettingsInput, updatedById: string) {
  const validated = growthSettingsSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    const previous = await tx.growthSettings.findUnique({ where: { id: GROWTH_SETTINGS_ID } });
    const settings = await tx.growthSettings.upsert({
      where: { id: GROWTH_SETTINGS_ID },
      create: { id: GROWTH_SETTINGS_ID, ...validated, updatedById },
      update: {
        ...validated,
        updatedById,
        configVersion: { increment: 1 },
      },
    });

    const domainsChanged = !previous || previous.ownedDomains.length !== settings.ownedDomains.length ||
      previous.ownedDomains.some((domain, index) => domain !== settings.ownedDomains[index]);
    if (domainsChanged) {
      const accounts = await tx.growthPinterestAccount.findMany({ select: { id: true } });
      for (const account of accounts) await reclassifyPinterestPins(account.id, settings.ownedDomains, tx);
    }

    await recordGrowthActivity(
      {
        actorKind: GrowthActivityActorKind.USER,
        actorUserId: updatedById,
        entityType: "GrowthSettings",
        entityId: GROWTH_SETTINGS_ID,
        action: "SETTINGS_UPDATED",
        fromState: previous?.enabled ? "ENABLED" : "DISABLED",
        toState: settings.enabled ? "ENABLED" : "DISABLED",
        summary: {
          enabled: settings.enabled,
          intensity: settings.intensity,
          workerBatchSize: settings.workerBatchSize,
          ownedDomains: settings.ownedDomains,
          attributionEnabled: settings.attributionEnabled,
          attributionWindowDays: settings.attributionWindowDays,
          attributionSessionRetentionDays: settings.attributionSessionRetentionDays,
          attributionEventRetentionDays: settings.attributionEventRetentionDays,
          evergreenCooldownDays: settings.evergreenCooldownDays,
          aiDailyBudgetCents: settings.aiDailyBudgetCents,
          aiMonthlyBudgetCents: settings.aiMonthlyBudgetCents,
          aiImagesPerDayCap: settings.aiImagesPerDayCap,
          translatorCreatesPerDayCap: settings.translatorCreatesPerDayCap,
          translatorUpdatesPerDayCap: settings.translatorUpdatesPerDayCap,
          ideaCreatesPerWeekCap: settings.ideaCreatesPerWeekCap,
          configVersion: settings.configVersion,
        },
        correlationKey: `growth-settings:${settings.configVersion}`,
      },
      tx,
    );

    return settings;
  });
}

/**
 * Revoke only the exact lease that this scoped invocation received. If another
 * actor changed the deadline, do not disable their different authorization.
 * A process crash cannot extend the persisted deadline, and every worker
 * independently treats an expired/missing deadline as disabled.
 */
export async function revokeGrowthWorkerActivation(expiresAt: Date) {
  return prisma.$transaction(async (tx) => {
    const updated = await tx.growthSettings.updateMany({
      where: { id: GROWTH_SETTINGS_ID, enabled: true, workerActivationExpiresAt: expiresAt },
      data: {
        enabled: false,
        workerActivationExpiresAt: null,
        configVersion: { increment: 1 },
      },
    });
    if (updated.count === 1) {
      await recordGrowthActivity({
        actorKind: GrowthActivityActorKind.SYSTEM,
        entityType: "GrowthSettings",
        entityId: GROWTH_SETTINGS_ID,
        action: "WORKER_ACTIVATION_REVOKED",
        fromState: "ENABLED",
        toState: "DISABLED",
        summary: { reason: "SCOPED_WORKER_EXIT" },
        correlationKey: `growth-worker-revoke:${expiresAt.toISOString()}`,
      }, tx);
    }
    return updated.count;
  });
}
