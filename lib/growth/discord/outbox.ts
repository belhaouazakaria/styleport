import { retirePendingTemplateReviews } from "@/lib/growth/approvals/ai-design-policy";
import {
  readReviewChoices,
  replaceReviewPlan,
  type ReviewChoices,
} from "@/lib/growth/approvals/choices";
import { prisma } from "@/lib/prisma";
import {
  decideGrowthReview,
  expireGrowthReviews,
} from "@/lib/growth/approvals/service";
import {
  budgetChangeSchema,
  pinReviewSnapshotSchema,
} from "@/lib/growth/approvals/contracts";
import { getDiscordConfig, type DiscordConfig } from "./config";
import { discordRequest, DiscordTransportError } from "./transport";

export function discordReviewCard(
  review: { id: string; snapshot: unknown; status: string; expiresAt: Date },
  execution?: {
    status: string;
    pinId: string | null;
    errorCode: string | null;
  },
  choices?: ReviewChoices,
) {
  const operation = budgetChangeSchema.safeParse(review.snapshot);
  if (operation.success) {
    const o = operation.data;
    return {
      content: "SayTwist · Protected budget decision · " + review.status,
      allowed_mentions: { parse: [] },
      embeds: [
        {
          title: "Change Growth AI budget ceilings",
          description: o.reason,
          fields: [
            {
              name: "Current → proposed limits",
              value: JSON.stringify(o.before) + " → " + JSON.stringify(o.after),
            },
            { name: "Benefits", value: o.benefits },
            { name: "Risks / costs", value: o.risks },
            {
              name: "On approval",
              value:
                "Apply only these exact limits if the current policy still matches. This does not initiate paid requests.",
            },
          ],
        },
      ],
      components: [
        {
          type: 1,
          components: [
            {
              type: 2,
              style: 3,
              label: "Approve exact limits",
              custom_id: "growth:" + review.id + ":APPROVE",
              disabled: review.status !== "PENDING",
            },
            {
              type: 2,
              style: 4,
              label: "Reject",
              custom_id: "growth:" + review.id + ":REJECT",
              disabled: review.status !== "PENDING",
            },
          ],
        },
      ],
    };
  }
  const s = pinReviewSnapshotSchema.parse(review.snapshot);
  const pending = review.status === "PENDING";
  return {
    content:
      "SayTwist · " +
      (pending ? "Your decision is needed" : review.status) +
      (execution ? " · Publication " + execution.status : ""),
    allowed_mentions: { parse: [] },
    embeds: [
      {
        title: s.title,
        description: s.description,
        color: pending ? 0xf08b34 : 0x245749,
        image: { url: s.assetUrl },
        fields: [
          ...(execution
            ? [
                {
                  name: "Publication result",
                  value:
                    execution.status +
                    (execution.pinId
                      ? " · https://www.pinterest.com/pin/" +
                        execution.pinId +
                        "/"
                      : " · No confirmed Pin ID") +
                    (execution.errorCode ? " · " + execution.errorCode : ""),
                },
              ]
            : []),
          { name: "Destination", value: s.destinationUrl },
          {
            name: "Account / board",
            value: s.accountName + " / " + s.boardName,
          },
          { name: "Recommended time (UTC)", value: s.scheduledAt },
          { name: "Why", value: s.reason },
          {
            name: "Risks and cost",
            value:
              s.risks +
              "\nAdditional API cost: " +
              s.estimatedCostCents +
              " cents.",
          },
          {
            name: "On approval",
            value:
              "Schedule this exact Pin. Changing a selector sends a new review; approve the latest complete plan. Publication revalidates your approved snapshot.",
          },
        ],
        footer: {
          text:
            "Expires " +
            review.expiresAt.toISOString() +
            " · Admin is always available",
        },
      },
    ],
    components: [
      ...(pending && choices
        ? (
            [
              [
                "PLAN_ACCOUNT",
                "Pinterest account",
                choices.accounts,
                s.accountId,
              ],
              ["PLAN_BOARD", "Pinterest board", choices.boards, s.boardId],
              [
                "PLAN_SITE",
                "Destination website",
                choices.sites,
                s.destinationDomain ?? "SOURCE_ORIGINAL",
              ],
            ] as const
          )
            .filter(([, , options]) => options.length > 0)
            .map(([action, placeholder, options, selected]) => ({
              type: 1,
              components: [
                {
                  type: 3,
                  custom_id: "growth:" + review.id + ":" + action,
                  placeholder,
                  min_values: 1,
                  max_values: 1,
                  disabled: options.length === 1,
                  options: options.map((option) => ({
                    ...option,
                    label: option.label.slice(0, 100),
                    default: option.value === selected,
                  })),
                },
              ],
            }))
        : []),
      {
        type: 1,
        components: [
          {
            type: 2,
            style: 3,
            label: "Approve this Pin",
            custom_id: "growth:" + review.id + ":APPROVE",
            disabled: !pending,
          },
          {
            type: 2,
            style: 4,
            label: "Reject",
            custom_id: "growth:" + review.id + ":REJECT",
            disabled: !pending,
          },
          {
            type: 2,
            style: 5,
            label: "Open Admin",
            url: "https://saytwist.com/admin/growth/approvals",
          },
        ],
      },
    ],
  };
}

export async function processDiscordDecisions(
  config: DiscordConfig,
  now = new Date(),
) {
  const receipts = await prisma.growthDiscordInteraction.findMany({
    where: { processedAt: null },
    orderBy: { receivedAt: "asc" },
    take: 20,
    include: { request: true },
  });
  let processed = 0;
  for (const receipt of receipts) {
    if (receipt.request.ownerUserId !== config.ownerUserId) continue;
    try {
      if (receipt.action.startsWith("PLAN_") && receipt.selectionValue) {
        await replaceReviewPlan(
          {
            requestId: receipt.requestId,
            action: receipt.action,
            value: receipt.selectionValue,
          },
          config.ownerUserId,
          now,
        );
      } else
        await decideGrowthReview(
          {
            requestId: receipt.requestId,
            action: receipt.action as "APPROVE" | "REJECT",
            snapshotChecksum: receipt.request.snapshotChecksum,
          },
          config.ownerUserId,
          "DISCORD",
          now,
        );
      await prisma.growthDiscordInteraction.update({
        where: { id: receipt.id },
        data: { processedAt: now },
      });
      processed++;
    } catch {
      // A failed execution leaves the request PENDING and receipt durable.
      // Expiry bounds retries; an incident is visible in the Admin audit trail.
      const key = "discord-decision-blocked:" + receipt.id;
      if (
        !(await prisma.growthActivity.findFirst({
          where: { correlationKey: key },
        }))
      )
        await prisma.growthActivity.create({
          data: {
            actorKind: "SYSTEM",
            entityType: "GrowthApprovalRequest",
            entityId: receipt.requestId,
            action: "DISCORD_DECISION_EXECUTION_BLOCKED",
            correlationKey: key,
            summary: { receiptId: receipt.id, providerCalls: 0 },
          },
        });
    }
  }
  return processed;
}

/** Bounded courier. Only confirmed rate-limit rejection is retried for POST.
 * SENDING after a crash becomes UNKNOWN, never another message submission.
 * PATCH finalization is idempotent and safely retried independently. */
export async function runDiscordOutbox(
  config = getDiscordConfig(),
  fetcher: typeof fetch = fetch,
  now = new Date(),
) {
  await retirePendingTemplateReviews(now);
  await expireGrowthReviews(now);
  const processed = await processDiscordDecisions(config, now);
  await prisma.growthNotification.updateMany({
    where: {
      status: "SENDING",
      attemptedAt: { lte: new Date(now.getTime() - 120_000) },
    },
    data: { status: "UNKNOWN", lastErrorCode: "WORKER_INTERRUPTED" },
  });
  const rows = await prisma.growthNotification.findMany({
    where: {
      status: { in: ["QUEUED", "RETRY"] },
      nextAttemptAt: { lte: now },
      attempts: { lt: 8 },
    },
    orderBy: { createdAt: "asc" },
    take: 10,
    include: { request: true },
  });
  let sent = 0;
  for (const row of rows) {
    if (row.request && row.request.ownerUserId !== config.ownerUserId) continue;
    if (row.request && row.request.status !== "PENDING") {
      await prisma.growthNotification.updateMany({
        where: { id: row.id, status: { in: ["QUEUED", "RETRY"] } },
        data: {
          status: "DEAD",
          lastErrorCode: "REVIEW_CLOSED_BEFORE_DELIVERY",
        },
      });
      continue;
    }
    const claim = await prisma.growthNotification.updateMany({
      where: {
        id: row.id,
        status: { in: ["QUEUED", "RETRY"] },
        nextAttemptAt: { lte: now },
      },
      data: { status: "SENDING", attemptedAt: now, attempts: { increment: 1 } },
    });
    if (claim.count !== 1) continue;
    let dispatchingMessage = false;
    try {
      const dm = await discordRequest(
        "/users/@me/channels",
        "POST",
        { recipient_id: config.ownerDiscordId },
        config,
        fetcher,
      );
      if (
        dm.type !== 1 ||
        dm.recipients?.length !== 1 ||
        dm.recipients[0].id !== config.ownerDiscordId
      )
        throw new DiscordTransportError("REJECTED");
      const payload = row.request
        ? discordReviewCard(
            row.request,
            undefined,
            row.request.kind === "PROTECTED_OPERATION"
              ? undefined
              : await readReviewChoices(row.request),
          )
        : row.payload;
      dispatchingMessage = true;
      const message = await discordRequest(
        "/channels/" + dm.id + "/messages",
        "POST",
        {
          ...(payload as object),
          allowed_mentions: { parse: [] },
          nonce: row.id.slice(-25),
          enforce_nonce: true,
        },
        config,
        fetcher,
      );
      if (message.channel_id !== dm.id)
        throw new DiscordTransportError("UNKNOWN");
      await prisma.growthNotification.update({
        where: { id: row.id },
        data: {
          status: "SENT",
          reviewCardVersion: 1,
          providerMessageId: message.id,
          providerChannelId: dm.id,
          lastErrorCode: null,
        },
      });
      sent++;
    } catch (e) {
      const error =
        e instanceof DiscordTransportError
          ? e
          : new DiscordTransportError("UNKNOWN");
      const retryable =
        error.code === "RATE_LIMIT" ||
        (!dispatchingMessage && error.code === "UNKNOWN");
      await prisma.growthNotification.update({
        where: { id: row.id },
        data: {
          status:
            retryable && row.attempts < 7
              ? "RETRY"
              : error.code === "UNKNOWN" && dispatchingMessage
                ? "UNKNOWN"
                : "DEAD",
          lastErrorCode: error.code,
          nextAttemptAt: new Date(
            now.getTime() +
              Math.max(error.retryAfterMs, 1000 * 2 ** (row.attempts + 1)),
          ),
        },
      });
    }
  }
  // Upgrade already-delivered pending cards through an idempotent PATCH.
  const outdated = await prisma.growthNotification.findMany({
    where: {
      status: "SENT",
      reviewCardVersion: 0,
      nextAttemptAt: { lte: now },
      request: {
        status: "PENDING",
        kind: { in: ["NATIVE_PIN", "SOURCE_PIN"] },
        ownerUserId: config.ownerUserId,
      },
    },
    include: { request: true },
    take: 10,
    orderBy: { createdAt: "asc" },
  });
  for (const row of outdated) {
    if (!row.request || !row.providerChannelId || !row.providerMessageId)
      continue;
    try {
      await discordRequest(
        "/channels/" +
          row.providerChannelId +
          "/messages/" +
          row.providerMessageId,
        "PATCH",
        discordReviewCard(
          row.request,
          undefined,
          await readReviewChoices(row.request),
        ),
        config,
        fetcher,
      );
      await prisma.growthNotification.update({
        where: { id: row.id },
        data: { reviewCardVersion: 1, lastErrorCode: null },
      });
    } catch {
      await prisma.growthNotification.update({
        where: { id: row.id },
        data: {
          lastErrorCode: "CARD_REFRESH_PENDING",
          nextAttemptAt: new Date(now.getTime() + 60_000),
        },
      });
    }
  }
  const closed = await prisma.growthNotification.findMany({
    where: {
      status: "SENT",
      finalizedAt: null,
      request: { status: { not: "PENDING" }, ownerUserId: config.ownerUserId },
      nextAttemptAt: { lte: now },
    },
    include: { request: true },
    take: 20,
    orderBy: { createdAt: "asc" },
  });
  for (const row of closed) {
    if (!row.request || !row.providerChannelId || !row.providerMessageId)
      continue;
    try {
      await discordRequest(
        "/channels/" +
          row.providerChannelId +
          "/messages/" +
          row.providerMessageId,
        "PATCH",
        discordReviewCard(row.request),
        config,
        fetcher,
      );
      await prisma.growthNotification.update({
        where: { id: row.id },
        data: { finalizedAt: now, lastErrorCode: null },
      });
    } catch (e) {
      const delay =
        e instanceof DiscordTransportError ? e.retryAfterMs : 60_000;
      await prisma.growthNotification.update({
        where: { id: row.id },
        data: {
          lastErrorCode: "FINALIZATION_PENDING",
          nextAttemptAt: new Date(now.getTime() + delay),
        },
      });
    }
  }
  // Later provider results update the same private review without creating
  // another approval or message. A failed PATCH is safely retried next tick.
  const approved = await prisma.growthNotification.findMany({
    where: {
      status: "SENT",
      finalizedAt: { not: null },
      request: {
        status: "APPROVED",
        kind: { in: ["NATIVE_PIN", "SOURCE_PIN"] },
        ownerUserId: config.ownerUserId,
      },
    },
    include: { request: true },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });
  for (const row of approved) {
    if (!row.request || !row.providerChannelId || !row.providerMessageId)
      continue;
    const result = row.request.result as { publicationId?: string } | null;
    const publication =
      row.request.kind === "NATIVE_PIN" && result?.publicationId
        ? await prisma.growthPinPublication.findUnique({
            where: { id: result.publicationId },
            select: {
              status: true,
              pinterestPinId: true,
              lastErrorCode: true,
              updatedAt: true,
            },
          })
        : row.request.kind === "SOURCE_PIN"
          ? await prisma.growthViralPinTest.findUnique({
              where: { id: row.request.subjectId },
              select: {
                status: true,
                pinterestPinId: true,
                lastErrorCode: true,
                updatedAt: true,
              },
            })
          : null;
    if (!publication || publication.updatedAt <= row.finalizedAt!) continue;
    try {
      await discordRequest(
        "/channels/" +
          row.providerChannelId +
          "/messages/" +
          row.providerMessageId,
        "PATCH",
        discordReviewCard(row.request, {
          status: publication.status,
          pinId: publication.pinterestPinId,
          errorCode: publication.lastErrorCode,
        }),
        config,
        fetcher,
      );
      await prisma.growthNotification.update({
        where: { id: row.id },
        data: { finalizedAt: now },
      });
    } catch {
      /* Idempotent status refresh; consent and provider outcome remain durable. */
    }
  }
  return { sent, processed };
}
