import {
  GrowthCreativeArchetype,
  GrowthCreativeDestinationKind,
  GrowthExperimentDimension,
} from "@prisma/client";
import { z } from "zod";

import { CREATIVE_EXPERIMENT_VERSION, CREATIVE_LAB_VERSION } from "@/lib/growth/creative/constants";

const identifier = z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/);
const selectableCreativeArchetypes = new Set<string>([GrowthCreativeArchetype.MINIMAL_STATEMENT, GrowthCreativeArchetype.BEFORE_AFTER]);

export const creativeGenerationJobPayloadSchema = z.object({
  targetKind: z.nativeEnum(GrowthCreativeDestinationKind),
  targetId: identifier,
  archetype: z.enum([
    GrowthCreativeArchetype.V1_CONTROL,
    GrowthCreativeArchetype.TYPOGRAPHY_LED,
    GrowthCreativeArchetype.EDITORIAL_LIST,
    GrowthCreativeArchetype.CONVERSATION_CHAT,
    GrowthCreativeArchetype.MINIMAL_STATEMENT,
    GrowthCreativeArchetype.BEFORE_AFTER,
    GrowthCreativeArchetype.SCENE_BASED,
  ]),
  useAiExample: z.boolean().optional(),
  accountId: identifier.optional(),
  experimentId: identifier.optional(),
  variantKey: identifier.optional(),
  creativeModelVersion: z.literal(CREATIVE_LAB_VERSION),
}).strict().superRefine((value, context) => {
  if (Boolean(value.experimentId) !== Boolean(value.variantKey)) {
    context.addIssue({ code: "custom", message: "experimentId and variantKey must be supplied together." });
  }
});

export const creativeGenerationRequestSchema = creativeGenerationJobPayloadSchema.superRefine((value, context) => {
  if (!selectableCreativeArchetypes.has(value.archetype)) {
    context.addIssue({ code: "custom", path: ["archetype"], message: "This Creative Lab concept is no longer selectable." });
  }
  if (value.archetype === GrowthCreativeArchetype.BEFORE_AFTER && value.targetKind !== GrowthCreativeDestinationKind.TRANSLATOR) {
    context.addIssue({ code: "custom", path: ["archetype"], message: "Before-and-after creatives require a Translator destination." });
  }
  if (value.useAiExample && value.archetype !== GrowthCreativeArchetype.BEFORE_AFTER) {
    context.addIssue({ code: "custom", path: ["useAiExample"], message: "AI example copy is available only for before-and-after creatives." });
  }
});

export const experimentVariantSchema = z.object({
  key: identifier,
  label: z.string().trim().min(1).max(100),
  value: z.string().trim().min(1).max(120),
}).strict();

export const experimentVariantsSchema = z.array(experimentVariantSchema).min(2).max(4).superRefine((variants, context) => {
  if (new Set(variants.map((variant) => variant.key)).size !== variants.length) {
    context.addIssue({ code: "custom", message: "Experiment variant keys must be unique." });
  }
});

export const experimentGuardrailsSchema = z.object({
  minimumImpressions: z.number().int().min(1).max(1_000_000),
  minimumOutboundClicks: z.number().int().min(0).max(100_000),
  maximumDays: z.number().int().min(1).max(90),
}).strict();

export const createExperimentSchema = z.object({
  clusterId: identifier.optional(),
  hypothesis: z.string().trim().min(10).max(500),
  dimension: z.nativeEnum(GrowthExperimentDimension),
  variants: experimentVariantsSchema,
  primaryKpi: z.enum(["OUTBOUND_CLICKS", "OUTBOUND_CTR", "SAVES", "QUALIFIED_CONVERSIONS"]),
  guardrails: experimentGuardrailsSchema,
  attributionModelVersion: z.string().trim().min(1).max(80),
  scoringModelVersion: z.string().trim().min(1).max(80),
  experimentModelVersion: z.literal(CREATIVE_EXPERIMENT_VERSION).default(CREATIVE_EXPERIMENT_VERSION),
}).strict();

export const creativeCopySchema = z.object({
  title: z.string().trim().min(3).max(100),
  description: z.string().trim().min(10).max(500),
  headline: z.string().trim().min(3).max(90),
  subheadline: z.string().trim().min(3).max(180),
  cta: z.string().trim().min(2).max(50),
  topic: z.string().trim().min(2).max(160),
  listItems: z.array(z.string().trim().min(2).max(80)).max(5),
  exampleInput: z.string().trim().min(3).max(180).optional(),
  exampleOutput: z.string().trim().min(3).max(180).optional(),
}).strict();

export type CreativeGenerationJobPayload = z.infer<typeof creativeGenerationJobPayloadSchema>;
export type CreativeCopy = z.infer<typeof creativeCopySchema>;
