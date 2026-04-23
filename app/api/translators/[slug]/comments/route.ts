import { CommentModerationStatus } from "@prisma/client";

import { apiError, apiOk } from "@/lib/api-response";
import { createTranslatorComment, getPublicTranslatorCommentTargetBySlug } from "@/lib/data/comments";
import { logWarn } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";
import { extractClientIp } from "@/lib/utils";
import { translatorCommentSchema } from "@/lib/validators";

interface RouteContext {
  params: Promise<{ slug: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  const { slug } = await context.params;
  const identifier = extractClientIp(request);
  const limit = checkRateLimit(`translator-comment:${slug}:${identifier}`, {
    maxRequests: 10,
    windowMs: 60_000,
  });

  if (!limit.allowed) {
    return apiError(429, "RATE_LIMITED", "Too many comments right now. Please try again shortly.");
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "BAD_REQUEST", "Invalid JSON payload.");
  }

  const parsed = translatorCommentSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(400, "VALIDATION_ERROR", "Please provide your name, email, and comment.");
  }

  if (parsed.data.honeypot?.trim()) {
    logWarn("translator_comment_honeypot_triggered", "Comment submission blocked by honeypot.", {
      slug,
      identifier,
    });
    return apiError(403, "FORBIDDEN", "Submission blocked.");
  }

  const translator = await getPublicTranslatorCommentTargetBySlug(slug);
  if (!translator) {
    return apiError(404, "NOT_FOUND", "Translator not found.");
  }

  const created = await createTranslatorComment({
    translatorId: translator.id,
    name: parsed.data.name,
    email: parsed.data.email,
    comment: parsed.data.comment,
  });

  return apiOk(
    {
      commentId: created.id,
      status: created.status,
      pendingReview: created.status === CommentModerationStatus.PENDING_REVIEW,
    },
    201,
  );
}
