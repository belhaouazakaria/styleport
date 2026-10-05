import { GrowthActivityActorKind, GrowthIntensity } from "@prisma/client";

import {
  DEFAULT_GROWTH_WORKER_BATCH_SIZE,
  GROWTH_SETTINGS_ID,
  type GrowthSettingsInput,
} from "@/lib/growth/contracts";
import { recordGrowthActivity } from "@/lib/growth/activity";
import { prisma } from "@/lib/prisma";

export const defaultGrowthSettings = {
  id: GROWTH_SETTINGS_ID,
  enabled: false,
  intensity: GrowthIntensity.BALANCED,
  workerBatchSize: DEFAULT_GROWTH_WORKER_BATCH_SIZE,
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
          configVersion: settings.configVersion,
        },
        correlationKey: `growth-settings:${settings.configVersion}`,
      },
      tx,
    );

    return settings;
  });
}
