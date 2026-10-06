import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";

import {
  ATTRIBUTION_MODEL_VERSION,
  ATTRIBUTION_PUBLIC_REF_PREFIX,
} from "@/lib/growth/attribution/constants";
import {
  buildAttributionUrl,
  destinationPathFromUrl,
  normalizeAttributionDestinationPath,
} from "@/lib/growth/attribution/urls";
import { prisma } from "@/lib/prisma";

export function generateAttributionPublicRef() {
  return `${ATTRIBUTION_PUBLIC_REF_PREFIX}${randomBytes(24).toString("base64url")}`;
}

export async function findActiveAttributionRef(publicRef: string) {
  const ref = await prisma.growthAttributionRef.findUnique({
    where: { publicRef },
  });
  return ref?.isActive && !ref.revokedAt ? ref : null;
}

export async function issueAttributionRefForPin(pinId: string) {
  const existing = await prisma.growthAttributionRef.findUnique({
    where: { pinId },
  });
  if (existing) {
    if (!existing.isActive || existing.revokedAt)
      throw new Error("The existing attribution ref is revoked.");
    return {
      ref: existing,
      url: buildAttributionUrl(existing),
      created: false,
    } as const;
  }

  const pin = await prisma.growthPinterestPin.findFirst({
    where: { id: pinId, isActive: true, analyticsEligible: true },
    select: {
      id: true,
      destinationUrl: true,
      account: { select: { publicationRole: true } },
    },
  });
  if (!pin?.destinationUrl)
    throw new Error(
      "Only active, analytics-eligible Pins with a canonical SayTwist destination can receive a ref.",
    );

  const destinationPath = destinationPathFromUrl(pin.destinationUrl);
  const publicRef = generateAttributionPublicRef();
  const campaignKey = pin.account.publicationRole.toLowerCase();

  try {
    const ref = await prisma.growthAttributionRef.create({
      data: {
        publicRef,
        pinId: pin.id,
        destinationPath,
        campaignKey,
        contentKey: publicRef,
        modelVersion: ATTRIBUTION_MODEL_VERSION,
      },
    });
    return { ref, url: buildAttributionUrl(ref), created: true } as const;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const raced = await prisma.growthAttributionRef.findUnique({
        where: { pinId },
      });
      if (raced?.isActive && !raced.revokedAt)
        return {
          ref: raced,
          url: buildAttributionUrl(raced),
          created: false,
        } as const;
    }
    throw error;
  }
}

export async function issueFutureAttributionRef(input: {
  logicalDestinationPath: string;
  campaignKey: string;
  contentKey?: string;
}) {
  if (!/^[a-z0-9][a-z0-9_-]{0,79}$/.test(input.campaignKey))
    throw new Error("Invalid attribution campaign key.");
  if (input.contentKey && !/^[A-Za-z0-9_-]{1,96}$/.test(input.contentKey))
    throw new Error("Invalid attribution content key.");
  const publicRef = generateAttributionPublicRef();
  const destinationPath = normalizeAttributionDestinationPath(
    input.logicalDestinationPath,
  );
  const ref = await prisma.growthAttributionRef.create({
    data: {
      publicRef,
      destinationPath,
      campaignKey: input.campaignKey,
      contentKey: input.contentKey || publicRef,
      modelVersion: ATTRIBUTION_MODEL_VERSION,
    },
  });
  return { ref, url: buildAttributionUrl(ref) };
}
