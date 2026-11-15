import { readFile } from "node:fs/promises";
import { inspectCreativeVisualEvidence } from "@/lib/growth/creative/visual-evidence";
import { prisma } from "@/lib/prisma";
import {
  creativeAssetChecksum,
  resolveCreativeAssetFile,
  validateCreativePng,
} from "@/lib/growth/creative/storage";
import { createNativePinReview } from "@/lib/growth/approvals/service";

/** Read-only by default. A fresh request is preparation, never approval. */
export async function auditFailedPinRecovery(ownerUserId?: string) {
  const originalId = "cmw7hj593000ea59zk36osdzu";
  const original = await prisma.growthPinCandidate.findUniqueOrThrow({
    where: { id: originalId },
    include: { asset: true, publications: true },
  });
  const recovery = await prisma.growthPinCandidate.findFirstOrThrow({
    where: {
      OR: [
        { id: "reoffer-" + originalId },
        { candidateKey: "reoffer-" + originalId },
      ],
    },
    include: { asset: true },
  });
  const file = resolveCreativeAssetFile(recovery.asset.publicPath);
  if (!file) throw Error("RECOVERY_ASSET_PATH_INVALID");
  const bytes = await readFile(file);
  validateCreativePng(bytes);
  const visualEvidence = await inspectCreativeVisualEvidence(bytes);
  if (visualEvidence.status === "REJECTED")
    throw Error("RECOVERY_ASSET_CORRUPTED");
  if (
    recovery.status !== "READY" ||
    creativeAssetChecksum(bytes) !== recovery.asset.checksum ||
    recovery.asset.checksum !== original.asset.checksum ||
    recovery.title !== original.title ||
    recovery.description !== original.description ||
    recovery.destinationPath !== original.destinationPath ||
    recovery.accountId !== original.accountId ||
    recovery.boardId !== original.boardId ||
    !original.publications.some((p) => p.status === "FAILED_TERMINAL")
  )
    throw Error("RECOVERY_EVIDENCE_MISMATCH");
  const review = ownerUserId
    ? await createNativePinReview(recovery.id, ownerUserId)
    : null;
  return {
    imageVerified: true,
    originalHistoryPreserved: true,
    recoveryReady: true,
    reviewId: review?.id ?? null,
    status: review?.status ?? "READ_ONLY",
    pinPublished: false,
  };
}
if (process.env.GROWTH_V2_RECOVERY_AUDIT === "true") {
  auditFailedPinRecovery(
    process.env.GROWTH_V2_PREPARE_RECOVERY_REVIEW === "true"
      ? process.env.GROWTH_DISCORD_OWNER_USER_ID
      : undefined,
  )
    .then((result) => console.log(JSON.stringify(result)))
    .catch(() => {
      console.error("RECOVERY_AUDIT_BLOCKED");
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
