import { GrowthDecisionType } from "@prisma/client";
import { z } from "zod";

import { TRANSLATOR_AUTOPILOT_VERSION } from "@/lib/growth/translator/constants";

export const translatorDecisionJobPayloadSchema = z
  .object({
    opportunityId: z.string().min(1).max(64),
    decisionModelVersion: z.literal(TRANSLATOR_AUTOPILOT_VERSION),
  })
  .strict();

export const translatorExecutionJobPayloadSchema = z
  .object({
    decisionId: z.string().min(1).max(64),
  })
  .strict();

export const translatorRollbackRequestSchema = z
  .object({
    targetVersionId: z.string().min(1).max(64),
    expectedCurrentChecksum: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

export interface TranslatorPlan {
  type: GrowthDecisionType;
  targetTranslatorId: string | null;
  confidence: number;
  reasonCodes: string[];
}

export interface CategoryOption {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  archivedAt: Date | null;
}
