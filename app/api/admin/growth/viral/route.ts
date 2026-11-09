import { apiError, apiOk } from "@/lib/api-response";
import { adminRouteGuard, getSessionOrNull } from "@/lib/permissions";
import { isSameOriginMutation } from "@/lib/growth/request-security";
import { viralPortfolioPolicySchema } from "@/lib/growth/viral/portfolio";
import {
  scanViralSourceCatalog, updateViralProgramSettings,
} from "@/lib/growth/viral/store";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const guard = await adminRouteGuard();
  if (guard) return guard;
  const [policy, concepts, total, tests, proposals, latest] = await Promise.all([
    prisma.growthViralProgramSettings.findUnique({ where: { id: "global" } }),
    prisma.growthViralConcept.findMany({
      select: { id: true, title: true, sourceUrl: true, status: true,
        rightsVerified: true, lastSeenAt: true, linkedTranslatorId: true },
      orderBy: { lastSeenAt: "desc" }, take: 40,
    }),
    prisma.growthViralConcept.count(),
    prisma.growthViralPinTest.count(),
    prisma.growthViralNicheProposal.count(),
    prisma.growthActivity.findFirst({
      where: { entityType: "GrowthViralSource", action: "CATALOG_SCAN_ARCHIVED" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, summary: true },
    }),
  ]);
  return apiOk({
    policy: policy ? { mode: policy.mode,
      sourceSharePercent: policy.sourceSharePercent,
      maxPinsPerDay: policy.maxPinsPerDay,
      configVersion: policy.configVersion } : null,
    counts: { concepts: total, pinTests: tests, nicheProposals: proposals },
    concepts, latest,
    actionsEnabled: false,
    perPinApprovalRequired: true,
    externalDestinationRewriteEnabled: false,
  });
}

export async function PUT(request: Request) {
  const guard = await adminRouteGuard();
  if (guard) return guard;
  if (!isSameOriginMutation(request)) {
    return apiError(403, "FORBIDDEN", "Cross-origin updates are prohibited.");
  }
  let body: unknown;
  try { body = await request.json(); }
  catch { return apiError(400, "BAD_REQUEST", "Invalid JSON."); }
  const parsed = viralPortfolioPolicySchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, "VALIDATION_ERROR", "Invalid source publishing quota policy.");
  }
  const session = await getSessionOrNull();
  if (!session?.user?.id) return apiError(401, "UNAUTHORIZED", "Authentication required.");
  try {
    const policy = await updateViralProgramSettings(parsed.data, session.user.id);
    return apiOk({ policy, existingGrowthSchedulesChanged: false,
      automaticallyPublishedPins: 0 });
  } catch {
    return apiError(409, "CONFLICT", "Could not update Viral Growth policy.");
  }
}

export async function POST(request: Request) {
  const guard = await adminRouteGuard();
  if (guard) return guard;
  if (!isSameOriginMutation(request)) {
    return apiError(403, "FORBIDDEN", "Cross-origin scans are prohibited.");
  }
  let body: unknown;
  try { body = await request.json(); }
  catch { return apiError(400, "BAD_REQUEST", "Invalid JSON."); }
  if (!body || typeof body !== "object" || Array.isArray(body) ||
      Object.keys(body).length !== 1 ||
      (body as Record<string, unknown>).action !== "SCAN_CATALOG") {
    return apiError(400, "VALIDATION_ERROR", "Only the bounded catalog scan is supported.");
  }
  try {
    const result = await scanViralSourceCatalog();
    return apiOk({ result, pinterestWrites: 0, paidAiCalls: 0 });
  } catch {
    return apiError(409, "CONFLICT",
      "Research is paused, already attempted today, or the public source is unavailable.");
  }
}
