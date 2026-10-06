import { createHash, randomBytes } from "node:crypto";
import {
  GrowthAttributionEventType,
  Prisma,
  type GrowthAttributionRef,
  type GrowthSettings,
} from "@prisma/client";

import {
  ATTRIBUTION_COOKIE_NAME,
  ATTRIBUTION_MODEL_VERSION,
} from "@/lib/growth/attribution/constants";
import { getAttributionCollectionStatus } from "@/lib/growth/attribution/config";
import { destinationMatchesRef } from "@/lib/growth/attribution/urls";
import { prisma } from "@/lib/prisma";

type DbClient = Prisma.TransactionClient | typeof prisma;

function addDays(value: Date, days: number) {
  return new Date(value.getTime() + days * 86_400_000);
}

function utcDay(value: Date) {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
}

export function generateAttributionSessionToken() {
  return randomBytes(32).toString("base64url");
}

export function hashAttributionSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function readAttributionCookie(request: Request) {
  const cookies = request.headers.get("cookie") || "";
  for (const part of cookies.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === ATTRIBUTION_COOKIE_NAME)
      return decodeURIComponent(rest.join("="));
  }
  return null;
}

export function attributionCookieOptions(
  settings: Pick<GrowthSettings, "attributionWindowDays">,
) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: settings.attributionWindowDays * 86_400,
  };
}

function aggregateDimensionKey(
  date: Date,
  refId: string,
  translatorId: string | null,
) {
  return `${date.toISOString().slice(0, 10)}:${ATTRIBUTION_MODEL_VERSION}:${refId}:${translatorId || "landing"}`;
}

async function incrementAggregate(
  db: DbClient,
  input: {
    occurredAt: Date;
    refId: string;
    translatorId: string | null;
    landingSessions?: number;
    attributedTranslations?: number;
    qualifiedConversions?: number;
  },
) {
  const metricDate = utcDay(input.occurredAt);
  const dimensionKey = aggregateDimensionKey(
    metricDate,
    input.refId,
    input.translatorId,
  );
  await db.growthAttributionDailyAggregate.upsert({
    where: { dimensionKey },
    create: {
      dimensionKey,
      metricDate,
      attributionRefId: input.refId,
      translatorId: input.translatorId,
      modelVersion: ATTRIBUTION_MODEL_VERSION,
      landingSessions: input.landingSessions || 0,
      attributedTranslations: input.attributedTranslations || 0,
      qualifiedConversions: input.qualifiedConversions || 0,
    },
    update: {
      landingSessions: { increment: input.landingSessions || 0 },
      attributedTranslations: { increment: input.attributedTranslations || 0 },
      qualifiedConversions: { increment: input.qualifiedConversions || 0 },
    },
  });
}

export async function recordQualifiedPinterestLanding(input: {
  request: Request;
  ref: GrowthAttributionRef;
  destinationPath: string;
  utmCampaign: string;
  utmContent: string;
  clientEventKey: string;
  now?: Date;
}) {
  const collection = await getAttributionCollectionStatus();
  if (!collection.enabled)
    return { collected: false, reason: collection.state } as const;
  if (
    input.ref.modelVersion !== ATTRIBUTION_MODEL_VERSION ||
    input.ref.campaignKey !== input.utmCampaign ||
    input.ref.contentKey !== input.utmContent ||
    !destinationMatchesRef(input.destinationPath, input.ref.destinationPath)
  )
    return { collected: false, reason: "INVALID_LANDING" } as const;

  const now = input.now || new Date();
  const existingToken = readAttributionCookie(input.request);
  let rawToken = existingToken || generateAttributionSessionToken();
  let tokenHash = hashAttributionSessionToken(rawToken);
  const settings = collection.settings;

  const result = await prisma.$transaction(async (tx) => {
    let session = await tx.growthAttributionSession.findFirst({
      where: {
        tokenHash,
        attributionExpiresAt: { gt: now },
        deleteAfter: { gt: now },
      },
    });
    const created = !session;
    if (!session) {
      // Never adopt an unknown browser-supplied token; rotate it to prevent cookie fixation.
      rawToken = generateAttributionSessionToken();
      tokenHash = hashAttributionSessionToken(rawToken);
      session = await tx.growthAttributionSession.create({
        data: {
          tokenHash,
          firstAttributionRefId: input.ref.id,
          lastAttributionRefId: input.ref.id,
          firstTouchAt: now,
          lastTouchAt: now,
          attributionExpiresAt: addDays(now, settings.attributionWindowDays),
          modelVersion: ATTRIBUTION_MODEL_VERSION,
          deleteAfter: addDays(now, settings.attributionSessionRetentionDays),
        },
      });
    }

    const eventKey = `landing:${session.id}:${input.clientEventKey}`;
    const insertedEvent = await tx.growthAttributionEvent.createMany({
      data: [
        {
          sessionId: session.id,
          attributionRefId: input.ref.id,
          type: GrowthAttributionEventType.PINTEREST_LANDING,
          eventKey,
          occurredAt: now,
          modelVersion: ATTRIBUTION_MODEL_VERSION,
          retentionAt: addDays(now, settings.attributionEventRetentionDays),
        },
      ],
      skipDuplicates: true,
    });
    if (insertedEvent.count === 0)
      return { session, created: false, duplicate: true };

    if (!created) {
      session = await tx.growthAttributionSession.update({
        where: { id: session.id },
        data: {
          lastAttributionRefId: input.ref.id,
          lastTouchAt: now,
          attributionExpiresAt: addDays(now, settings.attributionWindowDays),
          deleteAfter: addDays(now, settings.attributionSessionRetentionDays),
        },
      });
    }

    if (created)
      await incrementAggregate(tx, {
        occurredAt: now,
        refId: input.ref.id,
        translatorId: null,
        landingSessions: 1,
      });
    return { session, created, duplicate: false };
  });

  return { collected: true, token: rawToken, settings, ...result } as const;
}

export async function recordClientAttributionEvent(input: {
  request: Request;
  type: "TRANSLATOR_VIEW" | "INPUT_STARTED";
  translatorSlug: string;
  clientEventKey: string;
  now?: Date;
}) {
  const collection = await getAttributionCollectionStatus();
  if (!collection.enabled)
    return { collected: false, reason: collection.state } as const;
  const token = readAttributionCookie(input.request);
  if (!token) return { collected: false, reason: "NO_SESSION" } as const;
  const now = input.now || new Date();
  const [session, translator] = await Promise.all([
    prisma.growthAttributionSession.findFirst({
      where: {
        tokenHash: hashAttributionSessionToken(token),
        attributionExpiresAt: { gt: now },
        deleteAfter: { gt: now },
      },
    }),
    prisma.translator.findFirst({
      where: { slug: input.translatorSlug, isActive: true, archivedAt: null },
      select: { id: true },
    }),
  ]);
  if (!session || !translator)
    return {
      collected: false,
      reason: "INVALID_SESSION_OR_TRANSLATOR",
    } as const;

  const eventKey = `client:${session.id}:${input.type}:${input.clientEventKey}`;
  try {
    await prisma.growthAttributionEvent.create({
      data: {
        sessionId: session.id,
        attributionRefId: session.lastAttributionRefId,
        type: input.type,
        eventKey,
        occurredAt: now,
        translatorId: translator.id,
        modelVersion: session.modelVersion,
        retentionAt: addDays(
          now,
          collection.settings.attributionEventRetentionDays,
        ),
      },
    });
    return { collected: true, duplicate: false } as const;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { collected: true, duplicate: true } as const;
    }
    throw error;
  }
}

export async function recordTrustedTranslationCompletion(input: {
  request: Request;
  translationLogId: string;
  translatorId: string;
  now?: Date;
}) {
  const collection = await getAttributionCollectionStatus();
  if (!collection.enabled)
    return { collected: false, reason: collection.state } as const;
  const token = readAttributionCookie(input.request);
  if (!token) return { collected: false, reason: "NO_SESSION" } as const;
  const tokenHash = hashAttributionSessionToken(token);
  const now = input.now || new Date();

  return prisma.$transaction(async (tx) => {
    const sessions = await tx.$queryRaw<
      Array<{
        id: string;
        lastAttributionRefId: string;
        modelVersion: string;
        qualifiedConversionAt: Date | null;
        attributionExpiresAt: Date;
        deleteAfter: Date;
      }>
    >(Prisma.sql`
      SELECT "id", "lastAttributionRefId", "modelVersion", "qualifiedConversionAt", "attributionExpiresAt", "deleteAfter"
      FROM "GrowthAttributionSession"
      WHERE "tokenHash" = ${tokenHash}
      FOR UPDATE
    `);
    const session = sessions[0];
    if (
      !session ||
      session.attributionExpiresAt <= now ||
      session.deleteAfter <= now
    ) {
      return {
        collected: false,
        reason: "EXPIRED_OR_MISSING_SESSION",
      } as const;
    }

    const eventKey = `translation:${input.translationLogId}`;
    const existing = await tx.growthAttributionEvent.findUnique({
      where: { eventKey },
    });
    if (existing)
      return {
        collected: true,
        duplicate: true,
        primary: existing.isPrimaryQualifiedConversion,
      } as const;

    const primary = session.qualifiedConversionAt === null;
    if (primary) {
      const updated = await tx.growthAttributionSession.updateMany({
        where: { id: session.id, qualifiedConversionAt: null },
        data: {
          qualifiedConversionAt: now,
          qualifiedAttributionRefId: session.lastAttributionRefId,
          qualifiedTranslationLogId: input.translationLogId,
          qualifiedTranslatorId: input.translatorId,
        },
      });
      if (updated.count !== 1)
        throw new Error("Attribution conversion state changed while locked.");
    }

    await tx.growthAttributionEvent.create({
      data: {
        sessionId: session.id,
        attributionRefId: session.lastAttributionRefId,
        type: GrowthAttributionEventType.TRANSLATION_COMPLETED,
        eventKey,
        occurredAt: now,
        translatorId: input.translatorId,
        translationLogId: input.translationLogId,
        isPrimaryQualifiedConversion: primary,
        modelVersion: session.modelVersion,
        retentionAt: addDays(
          now,
          collection.settings.attributionEventRetentionDays,
        ),
      },
    });
    await incrementAggregate(tx, {
      occurredAt: now,
      refId: session.lastAttributionRefId,
      translatorId: input.translatorId,
      attributedTranslations: 1,
      qualifiedConversions: primary ? 1 : 0,
    });
    return { collected: true, duplicate: false, primary } as const;
  });
}
