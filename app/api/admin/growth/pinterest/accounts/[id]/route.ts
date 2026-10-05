import { apiError, apiOk } from "@/lib/api-response";
import { changePinterestAccountRole, disconnectPinterestAccount, isUniqueConstraintError } from "@/lib/growth/pinterest/accounts";
import { pinterestAccountIdSchema, pinterestDisconnectSchema, pinterestRoleUpdateSchema } from "@/lib/growth/pinterest/contracts";
import { isSameOriginMutation } from "@/lib/growth/request-security";
import { adminRouteGuard, getSessionOrNull } from "@/lib/permissions";

async function contextFor(request: Request, context: { params: Promise<{ id: string }> }) {
  const guard = await adminRouteGuard();
  if (guard) return { response: guard } as const;
  if (!isSameOriginMutation(request)) return { response: apiError(403, "FORBIDDEN", "Cross-origin Pinterest actions are not allowed.") } as const;
  const id = pinterestAccountIdSchema.safeParse((await context.params).id);
  if (!id.success) return { response: apiError(400, "VALIDATION_ERROR", "Invalid Pinterest account.") } as const;
  const session = await getSessionOrNull();
  if (!session?.user?.id) return { response: apiError(401, "UNAUTHORIZED", "Authentication required.") } as const;
  return { id: id.data, adminUserId: session.user.id } as const;
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const resolved = await contextFor(request, context);
  if ("response" in resolved) return resolved.response;
  const body = await request.json().catch(() => null);
  const parsed = pinterestRoleUpdateSchema.safeParse(body);
  if (!parsed.success) return apiError(400, "VALIDATION_ERROR", "Select a valid publication role.");
  try {
    return apiOk({ account: await changePinterestAccountRole(resolved.id, parsed.data.role, resolved.adminUserId) });
  } catch (error) {
    return apiError(isUniqueConstraintError(error) ? 409 : 400, isUniqueConstraintError(error) ? "CONFLICT" : "BAD_REQUEST", isUniqueConstraintError(error) ? "That publication role already has an active Pinterest account." : "The role could not be changed.");
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const resolved = await contextFor(request, context);
  if ("response" in resolved) return resolved.response;
  const parsed = pinterestDisconnectSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError(400, "VALIDATION_ERROR", "Deliberate disconnect confirmation is required.");
  await disconnectPinterestAccount(resolved.id, resolved.adminUserId);
  return apiOk({ disconnected: true });
}
