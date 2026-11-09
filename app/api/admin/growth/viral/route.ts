import { apiError, apiOk } from "@/lib/api-response";
import { adminRouteGuard, getSessionOrNull } from "@/lib/permissions";
import { isSameOriginMutation } from "@/lib/growth/request-security";
import { viralPortfolioPolicySchema } from "@/lib/growth/viral/portfolio";
import {
  scanViralSourceCatalog, updateViralProgramSettings,
} from "@/lib/growth/viral/store";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { approveOriginalSourcePin, prepareOriginalSourcePinDraft } from "@/lib/growth/viral/source-publishing";
import { evaluateTrackedViralPins, prepareNicheProposals, trackOwnedViralPin } from "@/lib/growth/viral/analytics";

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
      typeof (body as Record<string, unknown>).action !== "string") {
    return apiError(400, "VALIDATION_ERROR", "Unsupported Viral Growth action.");
  }
  const input = body as Record<string, unknown>;
  const action = input.action;
  const fields = Object.keys(input).sort();
  if (action === "SCAN_CATALOG" && fields.join(",") === "action") {
    try {
      const result = await scanViralSourceCatalog();
      return apiOk({ result, pinterestWrites: 0, paidAiCalls: 0 });
    } catch {
      return apiError(409, "CONFLICT",
        "Research is paused, already attempted today, or the public source is unavailable.");
    }
  }
  if (action === "EVALUATE_WINNERS" && fields.join(",") === "action") {
    try {
      const result = await evaluateTrackedViralPins();
      return apiOk({ result, source: "SAVED_OFFICIAL_PINTEREST_ANALYTICS",
        providerCalls: 0, pinterestWrites: 0 });
    } catch {
      return apiError(409, "CONFLICT", "Viral evaluation paused or unavailable.");
    }
  }
  const session = await getSessionOrNull();
  if (!session?.user?.id) return apiError(401, "UNAUTHORIZED", "Authentication required.");
  if (action === "TRACK_PIN" &&
      fields.join(",") === "action,conceptId,pinterestPinId" &&
      typeof input.conceptId === "string" &&
      typeof input.pinterestPinId === "string") {
    try {
      const result = await trackOwnedViralPin({
        conceptId: input.conceptId, pinterestPinId: input.pinterestPinId,
      }, session.user.id);
      return apiOk({ result, pinterestWrites: 0 });
    } catch {
      return apiError(409, "CONFLICT",
        "The Pin does not match the source or an active SayTwist translator.");
    }
  }
  if (action === "PREPARE_SOURCE_PIN" &&
      fields.join(",") === "action,conceptId" && typeof input.conceptId === "string") {
    try {
      const result = await prepareOriginalSourcePinDraft(input.conceptId, session.user.id);
      return apiOk({ result, imageSource: "ORIGINAL_SAYTWIST_DESIGN",
        pinterestWrites: 0, paidAiCalls: 0 });
    } catch {
      return apiError(409, "CONFLICT", "Original source draft not eligible.");
    }
  }
  const approvalSchema = z.object({
    action: z.literal("APPROVE_SOURCE_PIN"),
    draftId: z.string().min(10).max(191),
    accountId: z.string().min(1).max(191),
    boardId: z.string().min(1).max(191),
    scheduledAt: z.iso.datetime({ offset: true }),
    confirmation: z.literal(true),
  }).strict();
  if (action === "APPROVE_SOURCE_PIN") {
    const parsed = approvalSchema.safeParse(input);
    if (!parsed.success) {
      return apiError(400, "VALIDATION_ERROR", "Invalid approval.");
    }
    try {
      const result = await approveOriginalSourcePin({
        draftId: parsed.data.draftId, accountId: parsed.data.accountId,
        boardId: parsed.data.boardId, scheduledAt: parsed.data.scheduledAt,
        confirmation: true,
      }, session.user.id);
      return apiOk({ result, publishedImmediately: false,
        perPinOwnerApprovalRecorded: true });
    } catch {
      return apiError(409, "CONFLICT",
        "Pin approval blocked by quota, account, timing or safety checks.");
    }
  }
  if (action === "PREPARE_NICHE" &&
      fields.join(",") === "action,conceptId,proposals" &&
      typeof input.conceptId === "string" &&
      Array.isArray(input.proposals) && input.proposals.length <= 10) {
    try {
      const result = await prepareNicheProposals(input.conceptId, input.proposals);
      return apiOk({ result, aiCalls: 0, pinterestWrites: 0 });
    } catch {
      return apiError(409, "CONFLICT", "Niche ideas were not accepted.");
    }
  }
  return apiError(400, "VALIDATION_ERROR", "Unsupported or malformed Viral Growth action.");
}
