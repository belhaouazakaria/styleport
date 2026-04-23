import { prisma } from "@/lib/prisma";
import { adminRouteGuard } from "@/lib/permissions";
import { apiError, apiOk } from "@/lib/api-response";
import { updateTranslatorCommentStatus } from "@/lib/data/comments";
import { adminCommentStatusUpdateSchema } from "@/lib/validators";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, context: RouteContext) {
  const guard = await adminRouteGuard();
  if (guard) return guard;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "BAD_REQUEST", "Invalid JSON payload.");
  }

  const parsed = adminCommentStatusUpdateSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(400, "VALIDATION_ERROR", "Please provide a valid moderation status.");
  }

  const { id } = await context.params;
  const existing = await prisma.translatorComment.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!existing) {
    return apiError(404, "NOT_FOUND", "Comment not found.");
  }

  const updated = await updateTranslatorCommentStatus({
    id,
    status: parsed.data.status,
    moderationReason: parsed.data.moderationReason || null,
  });

  return apiOk({ comment: updated });
}
