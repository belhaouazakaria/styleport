import { auth } from "@/auth";
import { adminRouteGuard } from "@/lib/permissions";
import { apiError, apiOk } from "@/lib/api-response";
import { manuallyReenableTranslations } from "@/lib/usage-protection";
import { usageProtectionReenableSchema } from "@/lib/validators";

export async function POST(request: Request) {
  const guard = await adminRouteGuard();
  if (guard) return guard;

  let payload: unknown = {};

  try {
    payload = await request.json();
  } catch {
    payload = {};
  }

  const parsed = usageProtectionReenableSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(400, "VALIDATION_ERROR", "Please provide a valid re-enable payload.");
  }

  const session = await auth();

  const result = await manuallyReenableTranslations({
    actorId: session?.user?.id,
    reason: parsed.data.reason || undefined,
  });

  return apiOk(result);
}
