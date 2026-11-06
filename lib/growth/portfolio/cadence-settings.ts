import { GrowthActivityActorKind } from "@prisma/client";

import { recordGrowthActivity } from "@/lib/growth/activity";
import {
  DEFAULT_DAILY_CADENCE_POLICY,
  dailyCadencePolicySchema,
  type DailyCadencePolicy,
} from "@/lib/growth/portfolio/daily-cadence";
import { prisma } from "@/lib/prisma";

const ID = "global";

type StoredCadence = {
  pinMode: string;
  pinMinimum: number;
  pinMaximum: number;
  pinFixed: number | null;
  translatorMode: string;
  translatorMinimum: number;
  translatorMaximum: number;
  translatorFixed: number | null;
};

function fromStored(row: StoredCadence): DailyCadencePolicy {
  return dailyCadencePolicySchema.parse({
    pinCreatives: {
      mode: row.pinMode,
      minimum: row.pinMinimum,
      maximum: row.pinMaximum,
      fixed: row.pinFixed,
    },
    translatorCreates: {
      mode: row.translatorMode,
      minimum: row.translatorMinimum,
      maximum: row.translatorMaximum,
      fixed: row.translatorFixed,
    },
  });
}

/** Read-only. Missing row is the documented default, never a Growth enable. */
export async function getGrowthCadencePolicy(): Promise<DailyCadencePolicy> {
  const row = await prisma.growthDailyCadencePreference.findUnique({
    where: { id: ID },
  });
  return row ? fromStored(row) : DEFAULT_DAILY_CADENCE_POLICY;
}

/**
 * ADMIN action changes only the cadence preference. It cannot modify Growth
 * enabled, worker leases, publisher approvals, scheduler or hard spend caps.
 * The independent database CHECK constraints repeat the Zod validity gates.
 */
export async function updateGrowthCadencePolicy(
  input: unknown,
  actorUserId: string,
): Promise<DailyCadencePolicy> {
  if (!actorUserId.trim()) throw Error("CADENCE_ADMIN_ID_REQUIRED");
  const policy = dailyCadencePolicySchema.parse(input);
  const pin = policy.pinCreatives;
  const translator = policy.translatorCreates;
  return prisma.$transaction(async tx => {
    const previous = await tx.growthDailyCadencePreference.findUnique({
      where: { id: ID },
    });
    const data = {
      pinMode: pin.mode,
      pinMinimum: pin.minimum,
      pinMaximum: pin.maximum,
      pinFixed: pin.fixed,
      translatorMode: translator.mode,
      translatorMinimum: translator.minimum,
      translatorMaximum: translator.maximum,
      translatorFixed: translator.fixed,
      updatedById: actorUserId,
    };
    const next = await tx.growthDailyCadencePreference.upsert({
      where: { id: ID },
      create: { id: ID, ...data },
      update: { ...data, configVersion: { increment: 1 } },
    });
    await recordGrowthActivity({
      actorKind: GrowthActivityActorKind.USER,
      actorUserId,
      entityType: "GrowthDailyCadencePreference",
      entityId: ID,
      action: "CADENCE_POLICY_UPDATED",
      fromState: previous?.pinMode || "DEFAULT",
      toState: next.pinMode,
      summary: {
        pinCreatives: pin,
        translatorCreates: translator,
        planningOnly: true,
        noPublicationAuthorization: true,
        configVersion: next.configVersion,
      },
      correlationKey: "growth-cadence:" + next.configVersion,
    }, tx);
    return fromStored(next);
  });
}
