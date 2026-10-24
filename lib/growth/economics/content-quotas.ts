import {
  GrowthContentVersionAction,
  GrowthIdeaVersionAction,
  type Prisma,
} from "@prisma/client";
import { GROWTH_SETTINGS_ID } from "@/lib/growth/contracts";
import { NonRetryableGrowthJobError } from "@/lib/growth/errors";

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

/**
 * MUST run inside the same Prisma mutation transaction, AFTER acquiring the
 * GrowthSettings singleton row FOR UPDATE, BEFORE content mutation/versioning.
 * The row lock serializes competing content submissions across worker processes.
 * A plain read outside that lock is not an admission decision.
 */
export async function assertGrowthContentQuotaUnderLock(
  tx: Pick<Prisma.TransactionClient, "growthSettings" | "growthContentVersion" | "growthIdeaVersion">,
  kind: GrowthContentQuotaKind,
  now = new Date(),
) {
  const settings = await tx.growthSettings.findUnique({
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
    ? await tx.growthIdeaVersion.count({
        where: { action: GrowthIdeaVersionAction.CREATE, createdAt: { gte: from } },
      })
    : await tx.growthContentVersion.count({
        where: {
          action: kind === "TRANSLATOR_CREATE"
            ? GrowthContentVersionAction.CREATE : GrowthContentVersionAction.IMPROVE,
          createdAt: { gte: from },
        },
      });
  if (used >= cap) throw new GrowthContentQuotaError(kind + "_LIMIT");
}
