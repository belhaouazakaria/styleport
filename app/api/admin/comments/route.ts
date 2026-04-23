import { adminRouteGuard } from "@/lib/permissions";
import { apiError, apiOk } from "@/lib/api-response";
import { listAdminTranslatorComments } from "@/lib/data/comments";
import { adminCommentFilterSchema } from "@/lib/validators";

export async function GET(request: Request) {
  const guard = await adminRouteGuard();
  if (guard) return guard;

  const { searchParams } = new URL(request.url);
  const parsed = adminCommentFilterSchema.safeParse({
    q: searchParams.get("q") || undefined,
    status: searchParams.get("status") || undefined,
  });

  if (!parsed.success) {
    return apiError(400, "VALIDATION_ERROR", "Invalid comments filter query.");
  }

  const comments = await listAdminTranslatorComments(parsed.data);
  return apiOk({ comments });
}
