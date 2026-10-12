import { IndexingSource } from "@prisma/client";

import { adminRouteGuard } from "@/lib/permissions";
import { apiError, apiOk } from "@/lib/api-response";
import {
  getTranslatorIndexingEligibility,
  submitTranslatorToGoogleIndexing,
} from "@/lib/data/indexing";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  const guard = await adminRouteGuard();
  if (guard) return guard;

  const { id } = await context.params;
  const eligibility = await getTranslatorIndexingEligibility(id);

  if (!eligibility) {
    return apiError(404, "NOT_FOUND", "Translator not found.");
  }

  const { translator, assessment } = eligibility;

  if (!assessment.eligibleForIndexing) {
    return apiError(
      409,
      "BAD_REQUEST",
      `Indexing blocked: ${assessment.issues.join("; ")}`,
    );
  }

  try {
    const result = await submitTranslatorToGoogleIndexing({
      translatorId: translator.id,
      slug: translator.slug,
      source: IndexingSource.MANUAL_SINGLE,
      requestUrl: request.url,
    });

    return apiOk({ result });
  } catch {
    return apiError(
      500,
      "UPSTREAM_ERROR",
      "Unable to submit this translator to Google Indexing API.",
    );
  }
}
