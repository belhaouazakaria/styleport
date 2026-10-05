import { GrowthActivityActorKind } from "@prisma/client";
import { NextResponse } from "next/server";

import { apiError } from "@/lib/api-response";
import { recordGrowthActivity } from "@/lib/growth/activity";
import { pinterestPublicationRoleSchema } from "@/lib/growth/pinterest/contracts";
import { createPinterestOAuthState } from "@/lib/growth/pinterest/oauth";
import { toSafeGrowthError } from "@/lib/growth/safe-data";
import { adminRouteGuard, getSessionOrNull } from "@/lib/permissions";

export async function GET(request: Request) {
  const guard = await adminRouteGuard();
  if (guard) return guard;
  const session = await getSessionOrNull();
  if (!session?.user?.id) return apiError(401, "UNAUTHORIZED", "Authentication required.");
  const parsedRole = pinterestPublicationRoleSchema.safeParse(new URL(request.url).searchParams.get("role"));
  if (!parsedRole.success) return apiError(400, "VALIDATION_ERROR", "Select a valid Pinterest publication role.");
  try {
    const oauth = await createPinterestOAuthState(session.user.id, parsedRole.data);
    await recordGrowthActivity({
      actorKind: GrowthActivityActorKind.USER, actorUserId: session.user.id,
      entityType: "GrowthPinterestOAuth", entityId: parsedRole.data, action: "PINTEREST_OAUTH_INITIATED",
      summary: { publicationRole: parsedRole.data, expiresAt: oauth.expiresAt },
    });
    return NextResponse.redirect(oauth.authorizationUrl, 302);
  } catch (error) {
    return apiError(503, "UPSTREAM_ERROR", toSafeGrowthError(error));
  }
}
