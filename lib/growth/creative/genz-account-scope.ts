import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
export async function sourceUsesGenZ(draftId: string, reader: Pick<Prisma.TransactionClient, "growthActivity"> = prisma) {
  return Boolean(await reader.growthActivity.findFirst({ where: { entityType: "GrowthViralPinTest", entityId: draftId, action: "ORIGINAL_SOURCE_PIN_PREPARED", summary: { path: ["designStyle"], equals: "genz_editorial" } }, select: { id: true } }));
}
