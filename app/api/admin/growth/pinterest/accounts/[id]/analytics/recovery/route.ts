import { GrowthActivityActorKind } from "@prisma/client";
import { z } from "zod";

import { apiError, apiOk } from "@/lib/api-response";
import { recordGrowthActivity } from "@/lib/growth/activity";
import {
  assertRecoveryPreviewToken,
  enqueuePinterestAnalyticsRecovery,
  previewPinterestAnalyticsRecovery,
} from "@/lib/growth/pinterest/analytics-recovery";
import { pinterestAccountIdSchema } from "@/lib/growth/pinterest/contracts";
import { isSameOriginMutation } from "@/lib/growth/request-security";
import { getGrowthSettings } from "@/lib/growth/settings";
import { adminRouteGuard, getSessionOrNull } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

const requestSchema = z.discriminatedUnion("mode", [
  z
    .object({
      mode: z.literal("PREVIEW"),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    })
    .strict(),
  z
    .object({
      mode: z.literal("QUEUE"),
      startDate: z.string(),
      endDate: z.string(),
      previewToken: z.string(),
      confirmation: z.literal("RECOVER PINTEREST ANALYTICS"),
    })
    .strict(),
]);

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const guard = await adminRouteGuard();
  if (guard) return guard;
  if (!isSameOriginMutation(request))
    return apiError(
      403,
      "FORBIDDEN",
      "Cross-origin Pinterest actions are not allowed.",
    );
  const [routeParams, session] = await Promise.all([
    context.params,
    getSessionOrNull(),
  ]);
  const accountId = pinterestAccountIdSchema.safeParse(routeParams.id);
  if (!accountId.success)
    return apiError(400, "VALIDATION_ERROR", "Invalid Pinterest account.");
  const parsed = requestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return apiError(
      400,
      "VALIDATION_ERROR",
      "Invalid Pinterest analytics recovery request.",
    );
  const account = await prisma.growthPinterestAccount.findUnique({
    where: { id: accountId.data },
    select: { id: true, connectionStatus: true },
  });
  if (
    !account ||
    account.connectionStatus === "DISCONNECTED" ||
    account.connectionStatus === "REAUTH_REQUIRED"
  ) {
    return apiError(
      409,
      "CONFLICT",
      "Reconnect this Pinterest account before recovering analytics.",
    );
  }
  const adminUserId = session?.user?.id;
  if (!adminUserId)
    return apiError(401, "UNAUTHORIZED", "Administrator session required.");

  try {
    if (parsed.data.mode === "PREVIEW") {
      const preview = await previewPinterestAnalyticsRecovery({
        accountId: account.id,
        startDate: parsed.data.startDate,
        endDate: parsed.data.endDate,
      });
      await recordGrowthActivity({
        actorKind: GrowthActivityActorKind.USER,
        actorUserId: adminUserId,
        entityType: "GrowthPinterestAccount",
        entityId: account.id,
        action: "PINTEREST_ANALYTICS_RECOVERY_PREVIEWED",
        summary: {
          startDate: preview.startDate,
          endDate: preview.endDate,
          affectedPinCount: preview.affectedPinCount,
          estimatedApiRequests: preview.estimatedApiRequests,
          capExhausted: preview.capExhausted,
        },
      });
      return apiOk({ preview });
    }
    assertRecoveryPreviewToken(parsed.data.previewToken);
    const result = await enqueuePinterestAnalyticsRecovery({
      accountId: account.id,
      adminUserId,
      startDate: parsed.data.startDate,
      endDate: parsed.data.endDate,
      previewToken: parsed.data.previewToken,
    });
    const settings = await getGrowthSettings();
    return apiOk({
      recovery: {
        id: result.recovery.id,
        status: result.recovery.status,
        created: result.created,
        jobId: result.job.id,
      },
      growthEnabled: settings.enabled,
    });
  } catch (error) {
    return apiError(
      409,
      "CONFLICT",
      error instanceof Error
        ? error.message
        : "Pinterest analytics recovery could not be prepared.",
    );
  }
}
