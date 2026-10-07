import { validateTranslatorQuality } from "@/lib/growth/translator/quality";
import { readTranslatorSnapshot, snapshotToTranslatorInput } from "@/lib/growth/translator/snapshot";
import { prisma } from "@/lib/prisma";

export async function isGrowthManagedTranslator(translatorId: string) {
  return (await prisma.growthContentVersion.count({ where: { translatorId } })) > 0;
}

export async function assertGrowthTranslatorActivationReady(translatorId: string) {
  if (!(await isGrowthManagedTranslator(translatorId))) return;
  const current = await readTranslatorSnapshot(translatorId);
  if (!current) throw new Error("Growth-created Translator no longer exists.");
  const categories = await prisma.category.findMany({
    where: { id: { in: current.snapshot.categories.map((item) => item.id) }, isActive: true, archivedAt: null },
    select: { id: true },
  });
  const quality = validateTranslatorQuality(snapshotToTranslatorInput(current.snapshot), {
    activeCategoryIds: new Set(categories.map((item) => item.id)),
  });
  if (!quality.valid) throw new Error(`Growth-created Translator is not activation-ready: ${quality.diagnostics.map((item) => item.code).join(", ")}`);
  const shareImageReady = Boolean(
    current.translator.shareImagePath &&
    current.translator.shareImageHash &&
    current.translator.shareImageUpdatedAt,
  );
  if (!shareImageReady) throw new Error("Growth-created Translator cannot be activated until its share image is synchronized.");
}
