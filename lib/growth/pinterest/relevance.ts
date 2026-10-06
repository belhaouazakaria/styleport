import type { Prisma } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/prisma";

export const DEFAULT_OWNED_PINTEREST_DOMAINS = [
  "saytwist.com",
  "www.saytwist.com",
  "translator.whattypeof.com",
] as const;
export const MAX_OWNED_PINTEREST_DOMAINS = 20;
export const MAX_OWNED_PINTEREST_DOMAIN_LENGTH = 253;
export const PINTEREST_INVENTORY_FRESH_MS = 24 * 60 * 60 * 1000;
const RECLASSIFY_CHUNK_SIZE = 250;
const hostnamePattern = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export function normalizeOwnedPinterestDomain(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized.length > MAX_OWNED_PINTEREST_DOMAIN_LENGTH) throw new Error("Invalid owned Pinterest domain.");
  if (normalized.includes("*") || /[:/?#@\s]/.test(normalized) || !hostnamePattern.test(normalized)) {
    throw new Error("Invalid owned Pinterest domain.");
  }
  return normalized;
}

export const ownedPinterestDomainsSchema = z.array(z.string())
  .min(1)
  .max(MAX_OWNED_PINTEREST_DOMAINS)
  .superRefine((domains, context) => {
    domains.forEach((domain, index) => {
      try {
        normalizeOwnedPinterestDomain(domain);
      } catch {
        context.addIssue({ code: "custom", path: [index], message: "Use a hostname without a scheme, path, port, query, or wildcard." });
      }
    });
  })
  .transform((domains) => [...new Set(domains.map(normalizeOwnedPinterestDomain))]);

export function isOwnedPinterestDestination(destinationUrl: string | null | undefined, ownedDomains: readonly string[]) {
  if (!destinationUrl) return false;
  try {
    const parsed = new URL(destinationUrl);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
    const hostname = parsed.hostname.toLowerCase();
    return ownedDomains.some((domain) => hostname === domain.trim().toLowerCase());
  } catch {
    return false;
  }
}

type RelevanceClient = Pick<Prisma.TransactionClient, "growthPinterestPin" | "growthPinterestAnalyticsState">;

export async function reconcilePinterestAnalyticsProgress(accountId: string, db: RelevanceClient = prisma) {
  const where = { accountId, isActive: true, analyticsEligible: true } as const;
  const [total, processed] = await Promise.all([
    db.growthPinterestPin.count({ where }),
    db.growthPinterestPin.count({ where: { ...where, lastAnalyticsSyncAt: { not: null } } }),
  ]);
  await db.growthPinterestAnalyticsState.updateMany({
    where: { accountId },
    data: { backfillPinsTotal: total, backfillPinsProcessed: processed },
  });
  return { total, processed };
}

export async function reclassifyPinterestPins(
  accountId: string,
  ownedDomains: readonly string[],
  db: RelevanceClient = prisma,
) {
  const pins = await db.growthPinterestPin.findMany({
    where: { accountId },
    select: { id: true, destinationUrl: true },
  });
  const eligibleIds = pins.flatMap((pin) => isOwnedPinterestDestination(pin.destinationUrl, ownedDomains) ? [pin.id] : []);
  await db.growthPinterestPin.updateMany({ where: { accountId, analyticsEligible: true }, data: { analyticsEligible: false } });
  for (let index = 0; index < eligibleIds.length; index += RECLASSIFY_CHUNK_SIZE) {
    await db.growthPinterestPin.updateMany({
      where: { accountId, id: { in: eligibleIds.slice(index, index + RECLASSIFY_CHUNK_SIZE) } },
      data: { analyticsEligible: true },
    });
  }
  return reconcilePinterestAnalyticsProgress(accountId, db);
}

export function isPinterestInventoryFresh(lastInventorySyncAt: Date | null | undefined, now: Date) {
  if (!lastInventorySyncAt) return false;
  const age = now.getTime() - lastInventorySyncAt.getTime();
  return age < PINTEREST_INVENTORY_FRESH_MS;
}
