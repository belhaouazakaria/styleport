
import { GrowthJobType } from "@prisma/client";

import { enqueueGrowthJob } from "@/lib/growth/jobs";

export async function enqueuePinterestSyncJobs(accountId: string, now = new Date()) {
  const minuteBucket = Math.floor(now.getTime() / 60_000);
  const [account, boards] = await Promise.all([
    enqueueGrowthJob({
      type: GrowthJobType.PINTEREST_ACCOUNT_SYNC,
      idempotencyKey: `pinterest:account-sync:${accountId}:${minuteBucket}`,
      payload: { accountId },
      maxAttempts: 3,
    }),
    enqueueGrowthJob({
      type: GrowthJobType.PINTEREST_BOARD_SYNC,
      idempotencyKey: `pinterest:board-sync:${accountId}:${minuteBucket}`,
      payload: { accountId },
      maxAttempts: 3,
    }),
  ]);
  return { account, boards };
}
