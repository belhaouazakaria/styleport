import {
  GrowthContentVersionAction,
  GrowthIdeaVersionAction,
  type Prisma,
} from "@prisma/client";
import { GROWTH_SETTINGS_ID } from "@/lib/growth/contracts";
import { NonRetryableGrowthJobError } from "@/lib/growth/errors";
import { prisma } from "@/lib/prisma";

export type GrowthContentQuotaKind = "TRANSLATOR_CREATE" | "TRANSLATOR_IMPROVE" | "IDEA_CREATE";

export class GrowthContentQuotaError extends NonRetryableGrowthJobError {
  constructor(readonly reason: string) {
    super("Growth content quota blocked: " + reason);
    this.name = "GrowthContentQuotaError";
  }
}

export function growthQuotaUtcStart(kind: GrowthContentQuotaKind, now: Date) {
  if (!Number.isFinite(now.getTime())) throw new GrowthContentQuotaError("INVALID_QUOTA_DATE");
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (kind === "IDEA_CREATE") {
    const mondayOffset = (today.getUTCDay() + 6) % 7;
    today.setUTCDate(today.getUTCDate() - mondayOffset);
  }
  return today;
}

type QuotaReadClient = Pick<Prisma.TransactionClient, "growthSettings" | "growthContentVersion" | "growthIdeaVersion">;

/** Shared quota calculation. Only the caller's transaction lock makes it authoritative. */
async function checkQuota(
  db: QuotaReadClient, kind: GrowthContentQuotaKind, now: Date,
) {
  const settings = await db.growthSettings.findUnique({
    where: { id: GROWTH_SETTINGS_ID },
    select: {
      enabled: true, translatorCreatesPerDayCap: true,
      translatorUpdatesPerDayCap: true, ideaCreatesPerWeekCap: true,
    },
  });
  if (!settings?.enabled) throw new GrowthContentQuotaError("GROWTH_DISABLED");
  const cap = kind === "TRANSLATOR_CREATE" ? settings.translatorCreatesPerDayCap
    : kind === "TRANSLATOR_IMPROVE" ? settings.translatorUpdatesPerDayCap
    : settings.ideaCreatesPerWeekCap;
  if (!Number.isSafeInteger(cap) || cap < 0) throw new GrowthContentQuotaError("INVALID_CONTENT_CAP");
  const from = growthQuotaUtcStart(kind, now);
  const used = kind === "IDEA_CREATE"
    ? await db.growthIdeaVersion.count({
        where: { action: GrowthIdeaVersionAction.CREATE, createdAt: { gte: from } },
      })
    : await db.growthContentVersion.count({
        where: {
          action: kind === "TRANSLATOR_CREATE"
            ? GrowthContentVersionAction.CREATE : GrowthContentVersionAction.IMPROVE,
          createdAt: { gte: from },
        },
      });
  if (used >= cap) throw new GrowthContentQuotaError(kind + "_LIMIT");
}


/**
 * Read-only, non-authoritative preflight to avoid paying for obviously
 * quota-exhausted content. A concurrent worker can fill the last slot after
 * this check. NEVER use this as the final write authorization.
 */
export async function preflightGrowthContentQuota(
  kind: GrowthContentQuotaKind,
  now = new Date(),
  db: QuotaReadClient = prisma,
) {
  return checkQuota(db, kind, now);
}

/**
 * Authoritative check. Caller MUST already hold GrowthSettings FOR UPDATE
 * in the SAME transaction that persists the new content version. Serialize
 * worker mutations and budget-setting changes on that singleton row.
 */
export async function assertGrowthContentQuotaUnderLock(
  tx: QuotaReadClient,
  kind: GrowthContentQuotaKind,
  now = new Date(),
) {
  return checkQuota(tx, kind, now);
}
