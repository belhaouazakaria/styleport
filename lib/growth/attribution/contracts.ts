import { GrowthAttributionEventType } from "@prisma/client";
import { z } from "zod";

import {
  ATTRIBUTION_CLIENT_EVENT_KEY_PATTERN,
  ATTRIBUTION_PUBLIC_REF_PATTERN,
} from "@/lib/growth/attribution/constants";

const clientEventKeySchema = z.string().regex(ATTRIBUTION_CLIENT_EVENT_KEY_PATTERN);

export const attributionLandingSchema = z.object({
  pinRef: z.string().regex(ATTRIBUTION_PUBLIC_REF_PATTERN),
  utmSource: z.literal("pinterest"),
  utmMedium: z.literal("organic"),
  utmCampaign: z.string().min(1).max(80),
  utmContent: z.string().min(1).max(96),
  destinationPath: z.string().min(1).max(1_024),
  eventKey: clientEventKeySchema,
}).strict();

export const attributionClientEventSchema = z.object({
  type: z.enum([
    GrowthAttributionEventType.TRANSLATOR_VIEW,
    GrowthAttributionEventType.INPUT_STARTED,
  ]),
  translatorSlug: z.string().min(1).max(160),
  eventKey: clientEventKeySchema,
}).strict();

export const issueAttributionRefSchema = z.object({
  pinId: z.string().min(1).max(191),
}).strict();

export const attributionRetentionJobPayloadSchema = z.object({
  limit: z.number().int().min(1).max(500).default(100),
}).strict();
