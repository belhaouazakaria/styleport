import { IndexingSource } from "@prisma/client";

import { adminRouteGuard } from "@/lib/permissions";
import { apiError, apiOk } from "@/lib/api-response";
import { submitTranslatorToGoogleIndexing } from "@/lib/data/indexing";
import { prisma } from "@/lib/prisma";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  const guard = await adminRouteGuard();
  if (guard) return guard;

  const { id } = await context.params;
  const translator = await prisma.translator.findUnique({
    where: { id },
    select: {
      id: true,
      slug: true,
      isActive: true,
      archivedAt: true,
    },
  });

  if (!translator) {
    return apiError(404, "NOT_FOUND", "Translator not found.");
  }

  if (!translator.isActive || translator.archivedAt) {
    return apiError(400, "BAD_REQUEST", "Only active, non-archived translators can be submitted.");
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
    return apiError(500, "UPSTREAM_ERROR", "Unable to submit this translator to Google Indexing API.");
  }
}
