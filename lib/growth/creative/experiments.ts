import { GrowthExperimentStatus, Prisma } from "@prisma/client";

import { createExperimentSchema } from "@/lib/growth/creative/contracts";
import { prisma } from "@/lib/prisma";

export async function createDraftCreativeExperiment(input: unknown) {
  const parsed = createExperimentSchema.parse(input);
  if (parsed.clusterId) await prisma.growthContentCluster.findUniqueOrThrow({ where: { id: parsed.clusterId } });
  return prisma.growthExperiment.create({ data: {
    ...parsed,
    variants: parsed.variants as Prisma.InputJsonValue,
    guardrails: parsed.guardrails as Prisma.InputJsonValue,
    status: GrowthExperimentStatus.DRAFT,
  } });
}

export function readExperimentVariant(experiment: { status: GrowthExperimentStatus; variants: unknown }, variantKey: string) {
  if (experiment.status !== GrowthExperimentStatus.DRAFT) throw new Error("Creative generation requires a DRAFT experiment.");
  const variants = createExperimentSchema.shape.variants.parse(experiment.variants);
  const variant = variants.find((item) => item.key === variantKey);
  if (!variant) throw new Error("Creative experiment variant is unavailable.");
  return variant;
}

