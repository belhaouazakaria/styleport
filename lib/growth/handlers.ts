import { GrowthJobType, type GrowthJob } from "@prisma/client";
import { z } from "zod";

import { NonRetryableGrowthJobError } from "@/lib/growth/errors";
import { analyticsDateRange } from "@/lib/growth/pinterest/analytics-contract";
import {
  syncPinterestAccountAnalytics,
  syncPinterestPinAnalytics,
  syncPinterestPinInventory,
} from "@/lib/growth/pinterest/analytics";
import { syncPinterestAccount, syncPinterestBoards } from "@/lib/growth/pinterest/sync";

export interface GrowthJobHandlerContext {
  job: GrowthJob;
}

export type GrowthJobHandler = (context: GrowthJobHandlerContext) => Promise<Record<string, unknown>>;

const handlers = new Map<GrowthJobType, GrowthJobHandler>([
  [GrowthJobType.FOUNDATION_NOOP, async ({ job }) => ({ handled: true, type: job.type })],
  [GrowthJobType.PINTEREST_ACCOUNT_SYNC, async ({ job }) => {
    const payload = parsePinterestSyncPayload(job.payload);
    return syncPinterestAccount(payload.accountId);
  }],
  [GrowthJobType.PINTEREST_BOARD_SYNC, async ({ job }) => {
    const payload = parsePinterestSyncPayload(job.payload);
    return syncPinterestBoards(payload.accountId);
  }],
  [GrowthJobType.PINTEREST_PIN_INVENTORY_SYNC, async ({ job }) => {
    const payload = parsePinterestAnalyticsPayload(job.payload);
    return syncPinterestPinInventory(payload);
  }],
  [GrowthJobType.PINTEREST_ACCOUNT_ANALYTICS_SYNC, async ({ job }) => {
    const payload = parsePinterestAnalyticsPayload(job.payload);
    return syncPinterestAccountAnalytics(payload);
  }],
  [GrowthJobType.PINTEREST_PIN_ANALYTICS_SYNC, async ({ job }) => {
    const payload = parsePinterestAnalyticsPayload(job.payload, true);
    return syncPinterestPinAnalytics({ ...payload, batch: payload.batch || 0 });
  }],
]);

function parsePinterestSyncPayload(payload: unknown) {
  const parsed = z.object({ accountId: z.string().min(1) }).strict().safeParse(payload);
  if (!parsed.success) throw new NonRetryableGrowthJobError("Invalid Pinterest synchronization job payload.");
  return parsed.data;
}

function parsePinterestAnalyticsPayload(payload: unknown, requireBatch = false) {
  const parsed = z.object({
    accountId: z.string().min(1),
    startDate: z.string(),
    endDate: z.string(),
    runStartedAt: z.string().datetime({ offset: true }),
    batch: z.number().int().min(0).max(10_000).optional(),
  }).strict().safeParse(payload);
  if (!parsed.success || (requireBatch && parsed.data.batch === undefined)) {
    throw new NonRetryableGrowthJobError("Invalid Pinterest analytics job payload.");
  }
  try {
    analyticsDateRange(parsed.data);
  } catch {
    throw new NonRetryableGrowthJobError("Invalid Pinterest analytics date range.");
  }
  return parsed.data;
}

export async function dispatchGrowthJob(job: GrowthJob) {
  const handler = handlers.get(job.type);
  if (!handler) throw new Error(`Unsupported Growth job type: ${String(job.type)}`);
  return handler({ job });
}
