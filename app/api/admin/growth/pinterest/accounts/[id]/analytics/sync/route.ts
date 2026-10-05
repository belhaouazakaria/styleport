import { apiError, apiOk } from "@/lib/api-response";
import { enqueuePinterestAnalyticsSync } from "@/lib/growth/pinterest/analytics";
import { pinterestAccountIdSchema } from "@/lib/growth/pinterest/contracts";
import { isSameOriginMutation } from "@/lib/growth/request-security";
import { adminRouteGuard } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const guard = await adminRouteGuard();
  if (guard) return guard;
  if (!isSameOriginMutation(request)) return apiError(403, "FORBIDDEN", "Cross-origin Pinterest actions are not allowed.");
  const parsed = pinterestAccountIdSchema.safeParse((await context.params).id);
  if (!parsed.success) return apiError(400, "VALIDATION_ERROR", "Invalid Pinterest account.");
  const account = await prisma.growthPinterestAccount.findUnique({ where: { id: parsed.data }, select: { id: true, connectionStatus: true } });
  if (!account || account.connectionStatus === "DISCONNECTED" || account.connectionStatus === "REAUTH_REQUIRED") {
    return apiError(409, "CONFLICT", "Reconnect this Pinterest account before syncing analytics.");
  }
  const result = await enqueuePinterestAnalyticsSync(account.id);
  return apiOk({ created: result.account.created || result.inventory.created, range: result.range });
}
