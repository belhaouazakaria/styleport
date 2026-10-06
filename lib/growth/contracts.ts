import { GrowthIntensity, GrowthJobStatus, GrowthJobType } from "@prisma/client";
import { z } from "zod";
import { ownedPinterestDomainsSchema } from "@/lib/growth/pinterest/relevance";

export const GROWTH_SETTINGS_ID = "global";
export const DEFAULT_GROWTH_WORKER_BATCH_SIZE = 5;
export const MAX_GROWTH_WORKER_BATCH_SIZE = 25;
export const MAX_GROWTH_JOB_ATTEMPTS = 5;
export const MAX_GROWTH_JOB_PAYLOAD_BYTES = 8_192;
export const MAX_GROWTH_ACTIVITY_SUMMARY_BYTES = 8_192;
export const DEFAULT_GROWTH_LEASE_SECONDS = 5 * 60;

export const growthSettingsSchema = z
  .object({
    enabled: z.boolean(),
    intensity: z.nativeEnum(GrowthIntensity),
    workerBatchSize: z.number().int().min(1).max(MAX_GROWTH_WORKER_BATCH_SIZE),
    ownedDomains: ownedPinterestDomainsSchema,
  })
  .strict();

export type GrowthSettingsInput = z.infer<typeof growthSettingsSchema>;

export const growthJobPayloadSchema = z
  .record(z.string().max(80), z.unknown())
  .superRefine((value, context) => {
    if (Object.keys(value).length > 30) {
      context.addIssue({ code: "custom", message: "Growth job payload has too many fields." });
    }
  });

export const growthJobTypeSchema = z.nativeEnum(GrowthJobType);

export const growthJobStatusSchema = z.nativeEnum(GrowthJobStatus);
