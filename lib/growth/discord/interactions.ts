import { createPublicKey, verify } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { discordSnowflake, type DiscordInteractionConfig } from "./config";

export function verifyDiscordSignature(
  raw: string,
  signature: string | null,
  timestamp: string | null,
  publicKey: string,
  now = Date.now(),
) {
  if (
    !signature ||
    !/^[a-f0-9]{128}$/i.test(signature) ||
    !timestamp ||
    !/^\d{10,11}$/.test(timestamp) ||
    !/^[a-f0-9]{64}$/i.test(publicKey) ||
    Math.abs(now - Number(timestamp) * 1000) > 300_000
  )
    return false;
  try {
    const key = createPublicKey({
      key: Buffer.concat([
        Buffer.from("302a300506032b6570032100", "hex"),
        Buffer.from(publicKey, "hex"),
      ]),
      format: "der",
      type: "spki",
    });
    return verify(
      null,
      Buffer.from(timestamp + raw),
      key,
      Buffer.from(signature, "hex"),
    );
  } catch {
    return false;
  }
}
const interactionSchema = z.object({
  id: z.string().regex(discordSnowflake),
  application_id: z.string(),
  type: z.literal(3),
  guild_id: z.never().optional(),
  member: z.never().optional(),
  user: z.object({ id: z.string(), bot: z.literal(false).optional() }),
  channel_id: z.string().regex(discordSnowflake),
  channel: z.object({ type: z.literal(1) }),
  message: z.object({ id: z.string().regex(discordSnowflake) }),
  data: z.object({
    component_type: z.union([z.literal(2), z.literal(3)]),
    values: z.array(z.string().min(1).max(100)).length(1).optional(),
    custom_id: z.string().max(100),
  }),
});

/** Only the signed receipt is stored in the HTTP path. No provider call or
 * publication execution may delay Discord's three-second acknowledgement. */
export async function receiveDiscordDecision(
  body: unknown,
  config: DiscordInteractionConfig,
  now = new Date(),
) {
  const parsed = interactionSchema.safeParse(body);
  if (!parsed.success) return false;
  const i = parsed.data;
  if (
    i.application_id !== config.applicationId ||
    i.user.id !== config.ownerDiscordId
  )
    return false;
  const match =
    /^growth:([a-z0-9]{20,35}):(APPROVE|REJECT|PLAN_ACCOUNT|PLAN_BOARD|PLAN_SITE)$/.exec(
      i.data.custom_id,
    );
  if (!match) return false;
  const selection = match[2].startsWith("PLAN_");
  if (
    selection
      ? i.data.component_type !== 3 || !i.data.values
      : i.data.component_type !== 2 || i.data.values !== undefined
  )
    return false;
  const notification = await prisma.growthNotification.findFirst({
    where: {
      requestId: match[1],
      status: "SENT",
      providerChannelId: i.channel_id,
      providerMessageId: i.message.id,
      request: { ownerUserId: config.ownerUserId, ...(selection ? { kind: { in: ["NATIVE_PIN", "SOURCE_PIN"] } } : {}) },
    },
    select: { requestId: true },
  });
  if (!notification?.requestId) return false;
  try {
    await prisma.growthDiscordInteraction.create({
      data: {
        id: i.id,
        requestId: notification.requestId,
        action: match[2],
        selectionValue: selection ? i.data.values![0] : null,
        receivedAt: now,
      },
    });
  } catch (e) {
    if (
      !(e instanceof Prisma.PrismaClientKnownRequestError) ||
      e.code !== "P2002"
    )
      throw e;
  }
  return true;
}
