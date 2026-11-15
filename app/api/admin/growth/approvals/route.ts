import { z } from "zod";
import { apiError, apiOk } from "@/lib/api-response";
import { adminRouteGuard, getSessionOrNull } from "@/lib/permissions";
import { isSameOriginMutation } from "@/lib/growth/request-security";
import { prepareSourceReviewAutomatically } from "@/lib/growth/approvals/source-plan";
import { reviewDecisionSchema } from "@/lib/growth/approvals/contracts";
import {
  createNativePinReview,
  createSourcePinReview,
  decideGrowthReview,
} from "@/lib/growth/approvals/service";
const createSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("NATIVE_PIN"),
      candidateId: z.string().min(1).max(191),
    })
    .strict(),
  z
    .object({
      kind: z.literal("SOURCE_PIN"),
      draftId: z.string().min(1).max(191),
      accountId: z.string().min(1).max(191).optional(),
      boardId: z.string().min(1).max(191).optional(),
      scheduledAt: z.iso.datetime().optional(),
    })
    .strict(),
]);
async function authorize(request: Request) {
  const denied = await adminRouteGuard();
  if (denied) return { denied };
  if (!isSameOriginMutation(request))
    return {
      denied: apiError(403, "FORBIDDEN", "Cross-origin decision rejected."),
    };
  const session = await getSessionOrNull();
  if (!session?.user?.id)
    return { denied: apiError(401, "UNAUTHORIZED", "Admin session required.") };
  return { actor: session.user.id };
}
export async function POST(request: Request) {
  const auth = await authorize(request);
  if (auth.denied) return auth.denied;
  const input = createSchema.safeParse(await request.json().catch(() => null));
  if (!input.success)
    return apiError(400, "VALIDATION_ERROR", "Invalid review request.");
  try {
    const review =
      input.data.kind === "NATIVE_PIN"
        ? await createNativePinReview(input.data.candidateId, auth.actor!)
        : input.data.accountId && input.data.boardId && input.data.scheduledAt
          ? await createSourcePinReview(
              {
                draftId: input.data.draftId,
                accountId: input.data.accountId,
                boardId: input.data.boardId,
                scheduledAt: input.data.scheduledAt,
              },
              auth.actor!,
            )
          : await prepareSourceReviewAutomatically(
              input.data.draftId,
              auth.actor!,
            );
    return apiOk({ requestId: review.id, status: review.status });
  } catch {
    return apiError(
      409,
      "VALIDATION_ERROR",
      "This Pin cannot be offered. Check account, board, time and review history.",
    );
  }
}
export async function PATCH(request: Request) {
  const auth = await authorize(request);
  if (auth.denied) return auth.denied;
  const input = reviewDecisionSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!input.success)
    return apiError(
      400,
      "VALIDATION_ERROR",
      "Review identity, action and checksum are required.",
    );
  try {
    return apiOk(await decideGrowthReview(input.data, auth.actor!, "ADMIN"));
  } catch {
    return apiError(
      409,
      "VALIDATION_ERROR",
      "Decision was not applied. Refresh the inbox and check publication eligibility.",
    );
  }
}
