import { TranslationStatus } from "@prisma/client";

import { buildTranslatorPrompts } from "@/lib/prompt-builder";
import { translateWithOpenAI } from "@/lib/openai";
import { estimateCost } from "@/lib/pricing";
import { validateTranslateInput } from "@/lib/validators";
import { apiError, apiOk } from "@/lib/api-response";
import { logError, logWarn } from "@/lib/logger";
import {
  createTranslationLog,
  getDefaultRuntimeTranslator,
  getRuntimeTranslatorBySlug,
} from "@/lib/data/translators";
import { prisma } from "@/lib/prisma";
import { getAppSettings } from "@/lib/settings";
import {
  evaluatePostSuccessTokenCap,
  getRequestIdentity,
  runUsageProtectionPrecheck,
} from "@/lib/usage-protection";

export async function POST(request: Request) {
  const startedAt = Date.now();
  const identity = getRequestIdentity(request);

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    logWarn("translate_bad_json", "Translate endpoint received invalid JSON payload.");
    return apiError(400, "BAD_REQUEST", "Invalid JSON payload.");
  }

  const validation = validateTranslateInput(payload);
  if (!validation.ok) {
    logWarn("translate_validation_failed", "Translate request failed validation.", {
      status: validation.status,
      code: validation.error.code,
    });
    return apiError(validation.status, validation.error.code, validation.error.message);
  }

  const requestedSlug = validation.data.translatorSlug;
  const translator = requestedSlug
    ? await getRuntimeTranslatorBySlug(requestedSlug)
    : await getDefaultRuntimeTranslator();

  if (!translator) {
    if (requestedSlug) {
      const existing = await prisma.translator.findUnique({
        where: { slug: requestedSlug },
        select: { isActive: true, archivedAt: true },
      });

      if (existing && (!existing.isActive || existing.archivedAt)) {
        return apiError(403, "INACTIVE_TRANSLATOR", "This translator is currently unavailable.");
      }
    }

    logWarn("translate_translator_not_found", "Requested translator could not be resolved.", {
      requestedSlug,
    });
    return apiError(404, "NOT_FOUND", "Translator not found.");
  }

  const { systemPrompt, userPrompt, resolvedModeKey } = buildTranslatorPrompts({
    translator,
    userText: validation.data.text,
    modeKey: validation.data.modeKey,
  });

  const settings = await getAppSettings();
  const model = translator.modelOverride || settings.defaultModelOverride || undefined;

  const precheck = await runUsageProtectionPrecheck({
    ipHash: identity.ipHash,
  });

  if (precheck.blocked) {
    logWarn("translate_blocked", "Translate request blocked by usage protection guard.", {
      reason: precheck.reason,
      ipHash: identity.ipHash,
      translatorId: translator.id,
    });
    try {
      await createTranslationLog({
        translatorId: translator.id,
        inputText: validation.data.text,
        outputText: "",
        modeUsed: resolvedModeKey,
        status: TranslationStatus.BLOCKED,
        inputLength: validation.data.text.length,
        outputLength: 0,
        model: model || undefined,
        errorCode: precheck.reason,
        latencyMs: Date.now() - startedAt,
        ipHash: identity.ipHash,
        userAgent: identity.userAgent,
      });
    } catch {
      // Non-blocking log path.
    }

    return apiError(precheck.httpStatus, precheck.errorCode, precheck.message);
  }

  try {
    const generated = await translateWithOpenAI({
      systemPrompt,
      userPrompt,
      model,
    });

    const estimatedCost = estimateCost({
      model: generated.model,
      promptTokens: generated.promptTokens,
      completionTokens: generated.completionTokens,
      totalTokens: generated.totalTokens,
    });

    try {
      await createTranslationLog({
        translatorId: translator.id,
        inputText: validation.data.text,
        outputText: generated.text,
        modeUsed: resolvedModeKey,
        status: TranslationStatus.SUCCESS,
        inputLength: validation.data.text.length,
        outputLength: generated.text.length,
        model: generated.model,
        promptTokens: generated.promptTokens,
        completionTokens: generated.completionTokens,
        totalTokens: generated.totalTokens,
        estimatedCost,
        latencyMs: Date.now() - startedAt,
        ipHash: identity.ipHash,
        userAgent: identity.userAgent,
      });
    } catch {
      // Non-blocking log path.
    }

    try {
      await evaluatePostSuccessTokenCap();
    } catch {
      // Non-blocking guardrail evaluation path.
    }

    return apiOk({ result: generated.text });
  } catch {
    logError("translate_upstream_failure", "Translation generation failed in upstream call.", {
      translatorId: translator.id,
      requestedSlug,
    });
    try {
      await createTranslationLog({
        translatorId: translator.id,
        inputText: validation.data.text,
        outputText: "",
        modeUsed: resolvedModeKey,
        status: TranslationStatus.FAILURE,
        inputLength: validation.data.text.length,
        outputLength: 0,
        model: model || undefined,
        errorCode: "UPSTREAM_ERROR",
        latencyMs: Date.now() - startedAt,
        ipHash: identity.ipHash,
        userAgent: identity.userAgent,
      });
    } catch {
      // Non-blocking log path.
    }

    return apiError(502, "UPSTREAM_ERROR", "We couldn't refine that text just now.");
  }
}
