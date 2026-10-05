import { GrowthJobType, type GrowthJob } from "@prisma/client";

export interface GrowthJobHandlerContext {
  job: GrowthJob;
}

export type GrowthJobHandler = (context: GrowthJobHandlerContext) => Promise<Record<string, unknown>>;

const handlers = new Map<GrowthJobType, GrowthJobHandler>([
  [GrowthJobType.FOUNDATION_NOOP, async ({ job }) => ({ handled: true, type: job.type })],
]);

export async function dispatchGrowthJob(job: GrowthJob) {
  const handler = handlers.get(job.type);
  if (!handler) throw new Error(`Unsupported Growth job type: ${String(job.type)}`);
  return handler({ job });
}
