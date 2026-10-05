import { GrowthJobType, type GrowthJob } from "@prisma/client";
import { z } from "zod";

import { NonRetryableGrowthJobError } from "@/lib/growth/errors";
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
]);

function parsePinterestSyncPayload(payload: unknown) {
  const parsed = z.object({ accountId: z.string().min(1) }).strict().safeParse(payload);
  if (!parsed.success) throw new NonRetryableGrowthJobError("Invalid Pinterest synchronization job payload.");
  return parsed.data;
}

export async function dispatchGrowthJob(job: GrowthJob) {
  const handler = handlers.get(job.type);
  if (!handler) throw new Error(`Unsupported Growth job type: ${String(job.type)}`);
  return handler({ job });
}
