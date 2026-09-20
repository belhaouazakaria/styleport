import { auth } from "@/auth";
import { apiError, apiOk } from "@/lib/api-response";
import { adminRouteGuard } from "@/lib/permissions";
import { createAndProcessEditorialDraft } from "@/lib/translator-editorial-jobs";
import { z } from "zod";

const inputSchema = z.object({
  section: z.enum(["about", "whatItDoes", "bestUses", "howToUse", "tips", "examples", "faq", "differenceDescription", "full", "missing"]),
});

const operationBySection = {
  about: "REGENERATE_ABOUT", whatItDoes: "REGENERATE_WHAT_IT_DOES", differenceDescription: "REGENERATE_DIFFERENCE",
  bestUses: "REGENERATE_BEST_USES", howToUse: "REGENERATE_HOW_TO_USE", tips: "REGENERATE_TIPS",
  examples: "REGENERATE_EXAMPLES", faq: "REGENERATE_FAQ", full: "REGENERATE_FULL", missing: "GENERATE_MISSING",
} as const;

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const guard = await adminRouteGuard();
  if (guard) return guard;
  const session = await auth();

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "BAD_REQUEST", "Invalid JSON payload.");
  }

  const parsed = inputSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(400, "VALIDATION_ERROR", "Choose a valid editorial generation mode.");
  }

  try {
    const section = parsed.data.section;
    const result = await createAndProcessEditorialDraft({
      translatorId: (await context.params).id,
      operation: operationBySection[section],
      requestedById: session?.user?.id || null,
    });
    return apiOk({ section, draftId: result.draftId, jobId: result.jobId, editorial: result.editorial, value: section === "full" || section === "missing" ? result.editorial : result.editorial[section] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to generate editorial content right now.";
    return apiError(message.includes("not found") ? 404 : 502, "UPSTREAM_ERROR", message);
  }
}
