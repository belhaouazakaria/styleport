import { GrowthActivityActorKind, GrowthIntensity } from "@prisma/client";

import {
  DEFAULT_GROWTH_WORKER_BATCH_SIZE,
  GROWTH_SETTINGS_ID,
  type GrowthSettingsInput,
} from "@/lib/growth/contracts";
import { recordGrowthActivity } from "@/lib/growth/activity";
import { DEFAULT_OWNED_PINTEREST_DOMAINS, reclassifyPinterestPins } from "@/lib/growth/pinterest/relevance";
import { prisma } from "@/lib/prisma";

export const defaultGrowthSettings = {
  id: GROWTH_SETTINGS_ID,
  enabled: false,
  intensity: GrowthIntensity.BALANCED,
  workerBatchSize: DEFAULT_GROWTH_WORKER_BATCH_SIZE,
  ownedDomains: [...DEFAULT_OWNED_PINTEREST_DOMAINS],
  configVersion: 1,
  updatedById: null,
  createdAt: null,
  updatedAt: null,
} as const;

export async function getGrowthSettings() {
  return (await prisma.growthSettings.findUnique({ where: { id: GROWTH_SETTINGS_ID } })) || defaultGrowthSettings;
}

export async function updateGrowthSettings(input: GrowthSettingsInput, updatedById: string) {
  return prisma.$transaction(async (tx) => {
    const previous = await tx.growthSettings.findUnique({ where: { id: GROWTH_SETTINGS_ID } });
    const settings = await tx.growthSettings.upsert({
      where: { id: GROWTH_SETTINGS_ID },
      create: { id: GROWTH_SETTINGS_ID, ...input, updatedById },
      update: {
        ...input,
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
          configVersion: settings.configVersion,
        },
        correlationKey: `growth-settings:${settings.configVersion}`,
      },
      tx,
    );

    return settings;
  });
}
