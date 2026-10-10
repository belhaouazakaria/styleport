import { GrowthActivityActorKind, GrowthJobStatus, GrowthPublicationStatus } from "@prisma/client";
import { apiError, apiOk } from "@/lib/api-response";
import { recordGrowthActivity } from "@/lib/growth/activity";
import { cancelPublicationSchema } from "@/lib/growth/publishing/contracts";
import { isSameOriginMutation } from "@/lib/growth/request-security";
import { prisma } from "@/lib/prisma";
import { adminRouteGuard, getSessionOrNull } from "@/lib/permissions";

export async function POST(request: Request) {
  const guard = await adminRouteGuard(); if (guard) return guard;
  if (!isSameOriginMutation(request)) return apiError(403, "FORBIDDEN", "Cross-origin cancellation is not allowed.");
  const session = await getSessionOrNull(); let body: unknown; try { body = await request.json(); } catch { return apiError(400, "VALIDATION_ERROR", "A valid JSON payload is required."); }
  const parsed = cancelPublicationSchema.safeParse(body); if (!parsed.success || !session?.user?.id) return apiError(400, "VALIDATION_ERROR", "Invalid cancellation request.");
  try {
    const result = await prisma.$transaction(async (tx) => {
      const publication = await tx.growthPinPublication.findUnique({ where: { id: parsed.data.publicationId } });
      if (!publication || (publication.status !== GrowthPublicationStatus.SCHEDULED && publication.status !== GrowthPublicationStatus.FAILED_RETRYABLE)) throw new Error("Only a safely pre-write publication can be cancelled.");
      const changed = await tx.growthPinPublication.updateMany({
        where: { id: publication.id, status: publication.status },
        data: { status: GrowthPublicationStatus.CANCELLED },
      });
      if (changed.count !== 1) throw new Error("Publication state changed before it could be cancelled.");
      if (publication.publishJobId) await tx.growthJob.updateMany({ where: { id: publication.publishJobId, status: { in: [GrowthJobStatus.PENDING, GrowthJobStatus.FAILED_RETRYABLE] } }, data: { status: GrowthJobStatus.CANCELLED, completedAt: new Date() } });
      await recordGrowthActivity({ actorKind: GrowthActivityActorKind.USER, actorUserId: session.user.id, entityType: "GrowthPinPublication", entityId: publication.id, action: "PIN_PUBLICATION_CANCELLED", fromState: publication.status, toState: GrowthPublicationStatus.CANCELLED, correlationKey: publication.idempotencyKey }, tx);
      return { id: publication.id, status: GrowthPublicationStatus.CANCELLED };
    });
    return apiOk({ publicationId: result.id, status: result.status });
  } catch (error) { return apiError(400, "VALIDATION_ERROR", error instanceof Error ? error.message : "Cancellation failed."); }
}
