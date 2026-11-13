import { timingSafeEqual } from "node:crypto";
import { GrowthAssetState, GrowthPinCandidateStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildPublicCreativeAssetUrl } from "@/lib/growth/publishing/snapshot";
import { approvePinCandidate, recommendPinApprovalPlan, rejectPinCandidate } from "@/lib/growth/publishing/service";
import { domainForPinPath, isPinDestinationDomain, type PinDestinationDomain } from "@/lib/growth/publishing/destinations";

/** No Telegram update is trusted without both the Bot API webhook secret and
 * the exact private chat/user identity. This bot never accepts group actions. */
export type PrivatePinReviewConfig = {
  token: string;
  privateChatId: string;
  webhookSecret: string;
};
const TOKEN = /^[1-9][0-9]{5,14}:[A-Za-z0-9_-]{30,}$/;
const PRIVATE_ID = /^[1-9][0-9]{4,15}$/;
const SECRET = /^[A-Za-z0-9_-]{32,128}$/;

export function getPrivatePinReviewConfig(
  env: Record<string, string | undefined> = process.env,
): PrivatePinReviewConfig {
  if (env.GROWTH_TELEGRAM_PIN_APPROVALS_ENABLED !== "true") throw Error("PIN_REVIEW_DISABLED");
  const token = env.TELEGRAM_BOT_TOKEN || "";
  const privateChatId = env.TELEGRAM_REPORT_CHAT_ID || "";
  const webhookSecret = env.GROWTH_TELEGRAM_PIN_WEBHOOK_SECRET || "";
  if (!TOKEN.test(token) || !PRIVATE_ID.test(privateChatId) || !SECRET.test(webhookSecret)) {
    throw Error("PIN_REVIEW_CONFIG_INVALID");
  }
  return { token, privateChatId, webhookSecret };
}

export function secretMatches(provided: string | null, expected: string) {
  const first = Buffer.from(provided || "");
  const second = Buffer.from(expected);
  return first.length === second.length && timingSafeEqual(first, second);
}

type TelegramReply = {
  ok?: boolean;
  result?: { message_id?: number; chat?: { id?: number | string; type?: string } };
};

async function telegramRequest(
  method: "sendPhoto" | "answerCallbackQuery",
  payload: object,
  config: PrivatePinReviewConfig,
  fetcher: typeof fetch,
): Promise<TelegramReply> {
  let response: Response;
  try {
    response = await fetcher("https://api.telegram.org/bot" + config.token + "/" + method, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    // Bot token and raw Telegram response are intentionally never logged.
    throw Error("PIN_REVIEW_TELEGRAM_OUTCOME_UNKNOWN");
  }
  if (!response.ok) throw Error("PIN_REVIEW_TELEGRAM_NOT_CONFIRMED");
  const data = await response.json().catch(() => null) as TelegramReply | null;
  if (!data || data.ok !== true) throw Error("PIN_REVIEW_TELEGRAM_OUTCOME_UNKNOWN");
  return data;
}

export function pinReviewButtons(
  reviewId: string,
  destinationPath: string,
  preferred: PinDestinationDomain,
) {
  const domain = domainForPinPath(preferred, destinationPath);
  const available: PinDestinationDomain[] = domainForPinPath("translator.whattypeof.com", destinationPath) === "translator.whattypeof.com"
    ? [domain, domain === "saytwist.com" ? "translator.whattypeof.com" : "saytwist.com"]
    : ["saytwist.com"];
  return {
    inline_keyboard: [
      ...available.map(host => [{
        text: host === domain ? "Approve Pin (default: " + host + ")" : "Approve Pin (" + host + ")",
        callback_data: "p:" + reviewId + ":" + (host === "saytwist.com" ? "s" : "l"),
      }]),
      [{ text: "Reject this Pin", callback_data: "p:" + reviewId + ":r" }],
    ],
  };
}

/** Admin-triggered bounded offer. Reserved before Bot API call, never silently
 * replayed if the outcome is ambiguous. Callback is tied to message_id. */
export async function offerPinForTelegramReview(
  candidateId: string,
  ownerUserId: string,
  config = getPrivatePinReviewConfig(),
  fetcher: typeof fetch = fetch,
  now = new Date(),
) {
  const [candidate, owner, preference] = await Promise.all([
    prisma.growthPinCandidate.findUnique({
      where: { id: candidateId }, include: { asset: true },
    }),
    prisma.user.findUnique({ where: { id: ownerUserId }, select: { id: true, role: true } }),
    prisma.growthSettings.findUnique({ where: { id: "global" }, select: { defaultPinterestDestinationDomain: true } }),
  ]);
  if (!owner || owner.role !== "ADMIN" || !candidate ||
      candidate.status !== GrowthPinCandidateStatus.READY ||
      candidate.asset.state !== GrowthAssetState.READY ||
      candidate.asset.mimeType !== "image/png" ||
      candidate.asset.width !== 1000 || candidate.asset.height !== 1500) {
    throw Error("PIN_REVIEW_CANDIDATE_NOT_READY");
  }
  const plan = await recommendPinApprovalPlan(candidateId, now);
  const domain = preference?.defaultPinterestDestinationDomain;
  const selectedDomain = domain || "saytwist.com";
  if (!isPinDestinationDomain(selectedDomain)) throw Error("PIN_REVIEW_DOMAIN_INVALID");
  const preferenceDomain = domainForPinPath(selectedDomain, candidate.destinationPath);
  const existing = await prisma.growthTelegramPinReview.findUnique({ where: { candidateId } });
  if (plan.scheduledAt.getTime() <= now.getTime() + 2 * 60_000) throw Error("PIN_REVIEW_SLOT_TOO_SOON");
  if (existing) throw Error("PIN_REVIEW_ALREADY_ATTEMPTED");
  const review = await prisma.growthTelegramPinReview.create({
    data: {
      candidateId, candidateRevision: candidate.revision, accountId: plan.accountId,
      boardId: plan.boardId, scheduledAt: plan.scheduledAt,
      ownerUserId, status: "QUEUED",
      expiresAt: new Date(Math.min(now.getTime() + 24 * 60 * 60_000, plan.scheduledAt.getTime() - 60_000)),
    },
  });
  const caption = [
    "SayTwist Pin approval",
    candidate.title.slice(0, 100),
    candidate.description.slice(0, 360),
    "Board: " + plan.boardName.slice(0, 100),
    "Suggested time: " + plan.scheduledAt.toISOString() + " (UTC)",
    "Website default: " + preferenceDomain,
    "Approve only if you want this specific Pin published.",
  ].join("\n").slice(0, 950);
  try {
    const result = await telegramRequest("sendPhoto", {
      chat_id: config.privateChatId,
      photo: buildPublicCreativeAssetUrl(candidate.asset.publicPath),
      caption,
      reply_markup: pinReviewButtons(review.id, candidate.destinationPath, preferenceDomain),
      protect_content: true,
    }, config, fetcher);
    const messageId = result.result?.message_id;
    if (!Number.isSafeInteger(messageId) || !messageId ||
        !result.result?.chat || result.result.chat.type !== "private" ||
        String(result.result.chat.id) !== config.privateChatId) {
      throw Error("PIN_REVIEW_TELEGRAM_OUTCOME_UNKNOWN");
    }
    await prisma.growthTelegramPinReview.update({
      where: { id: review.id }, data: {
        status: "SENT", telegramMessageId: messageId, sentAt: new Date(),
      },
    });
    return { status: "SENT" as const };
  } catch {
    await prisma.growthTelegramPinReview.update({
      where: { id: review.id }, data: { status: "UNKNOWN" },
    }).catch(() => undefined);
    throw Error("PIN_REVIEW_SEND_NOT_CONFIRMED");
  }
}

export type PinCallback = {
  id: string;
  from: { id: number | string };
  data: string;
  message: {
    message_id: number;
    chat: { id: number | string; type: string };
  };
};

export function parsePrivatePinCallback(update: unknown, chatId: string) {
  if (!update || typeof update !== "object" || Array.isArray(update)) return null;
  const callback = (update as { callback_query?: PinCallback }).callback_query;
  if (!callback || typeof callback.id !== "string" || callback.id.length > 256 ||
      callback.message?.chat?.type !== "private" ||
      String(callback.message?.chat?.id) !== chatId ||
      String(callback.from?.id) !== chatId ||
      !Number.isSafeInteger(callback.message?.message_id)) return null;
  const matched = /^p:([a-z0-9]{10,35}):(s|l|r)$/.exec(callback.data || "");
  if (!matched) return null;
  return { id: matched[1], action: matched[2] as "s"|"l"|"r",
    messageId: callback.message.message_id, callbackId: callback.id };
}

/** This is the sole bridge to the existing immutable per-Pin approval service.
 * Replays, stale candidate revisions and unmatched Telegram messages fail closed. */
export async function acceptPrivatePinCallback(
  update: unknown,
  config = getPrivatePinReviewConfig(),
  fetcher: typeof fetch = fetch,
  now = new Date(),
) {
  const parsed = parsePrivatePinCallback(update, config.privateChatId);
  if (!parsed) return { status: "IGNORED" as const };
  const review = await prisma.growthTelegramPinReview.findUnique({
    where: { id: parsed.id },
    include: { candidate: { select: { revision: true, status: true, destinationPath: true } } },
  });
  if (!review || review.status !== "SENT" ||
      review.expiresAt <= now ||
      review.telegramMessageId !== parsed.messageId ||
      review.candidate.revision !== review.candidateRevision ||
      review.candidate.status !== GrowthPinCandidateStatus.READY) {
    return { status: "IGNORED" as const };
  }
  const owner = await prisma.user.findUnique({
    where: { id: review.ownerUserId }, select: { role: true },
  });
  if (owner?.role !== "ADMIN") return { status: "IGNORED" as const };
  const claim = await prisma.growthTelegramPinReview.updateMany({
    where: { id: review.id, status: "SENT", expiresAt: { gt: now },
      telegramMessageId: parsed.messageId },
    data: { status: "PROCESSING" },
  });
  if (claim.count !== 1) return { status: "IGNORED" as const };

  let result: "APPROVED" | "REJECTED";
  try {
    if (parsed.action === "r") {
      await rejectPinCandidate({ candidateId: review.candidateId,
        reason: "Rejected by owner in private Telegram Pin review." }, review.ownerUserId, now);
      result = "REJECTED";
    } else {
      const selected = parsed.action === "l" ? "translator.whattypeof.com" : "saytwist.com";
      if (domainForPinPath(selected, review.candidate.destinationPath) !== selected) {
        throw Error("PIN_REVIEW_DOMAIN_INVALID");
      }
      const approved = await approvePinCandidate({
        candidateId: review.candidateId,
        accountId: review.accountId, boardId: review.boardId,
        scheduledAt: review.scheduledAt.toISOString(), confirmation: true,
        destinationDomain: selected,
      }, review.ownerUserId, now);
      await prisma.growthTelegramPinReview.update({
        where: { id: review.id }, data: { status: "APPROVED",
          actedAt: now, destinationDomain: selected,
          publicationId: approved.publication?.id || null },
      });
      result = "APPROVED";
    }
    if (result === "REJECTED") {
      await prisma.growthTelegramPinReview.update({
        where: { id: review.id }, data: { status: "REJECTED", actedAt: now },
      });
    }
  } catch {
    await prisma.growthTelegramPinReview.update({
      where: { id: review.id }, data: { status: "FAILED", actedAt: now },
    }).catch(() => undefined);
    return { status: "FAILED" as const };
  }
  // Approval is already durable. Telegram acknowledgement is best effort.
  await telegramRequest("answerCallbackQuery", {
    callback_query_id: parsed.callbackId,
    text: result === "APPROVED" ? "Pin approved and scheduled." : "Pin rejected.",
    show_alert: false,
  }, config, fetcher).catch(() => undefined);
  return { status: result };
}


/** Opt-in daily courier: forwards at most three recent READY candidates to the
 * one private owner chat. Never approves or publishes on its own. */
export async function dispatchPendingPinReviews(
  config = getPrivatePinReviewConfig(),
  fetcher: typeof fetch = fetch,
  now = new Date(),
  ownerUserId = process.env.GROWTH_TELEGRAM_PIN_OWNER_USER_ID || "",
) {
  if (!ownerUserId || ownerUserId.length > 191) throw Error("PIN_REVIEW_OWNER_NOT_CONFIGURED");
  const guard = await prisma.growthSettings.findUnique({
    where: { id: "global" },
    select: { enabled: true, attributionEnabled: true, workerActivationExpiresAt: true },
  });
  if (!guard || guard.enabled || guard.attributionEnabled ||
      guard.workerActivationExpiresAt !== null) throw Error("PIN_REVIEW_GLOBAL_GATE");
  const candidates = await prisma.growthPinCandidate.findMany({
    where: { status: GrowthPinCandidateStatus.READY,
      createdAt: { gte: new Date(now.getTime() - 72 * 60 * 60_000) },
      telegramReview: { is: null },
      approvals: { none: { status: "APPROVED" } },
    },
    select: { id: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: 3,
  });
  let submitted = 0;
  for (const candidate of candidates) {
    // Never automatically retry an ambiguous offer. If the first candidate
    // cannot be recommended or delivered, stop without attempting another.
    await offerPinForTelegramReview(candidate.id, ownerUserId, config, fetcher, now);
    submitted++;
  }
  return { submitted };
}
