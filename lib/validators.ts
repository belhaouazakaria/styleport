import { z } from "zod";
import { TranslatorRequestStatus } from "@prisma/client";

import { MAX_INPUT_CHARS } from "@/lib/constants";
import type { ApiError } from "@/lib/types";
import { safeTrim } from "@/lib/utils";

export const modeKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9-]+$/i, "Mode key must be alphanumeric or dash.");

export const translatorSlugSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9-]+$/, "Slug must use lowercase letters, numbers, and dashes.");

export const translateRequestSchema = z.object({
  text: z.string(),
  translatorSlug: z.string().trim().optional(),
  modeKey: z.string().trim().optional(),
  mode: z.string().trim().optional(),
});

export type TranslateValidationResult =
  | {
      ok: true;
      data: { text: string; translatorSlug?: string; modeKey?: string };
    }
  | {
      ok: false;
      status: number;
      error: ApiError;
    };

export function validateTranslateInput(payload: unknown): TranslateValidationResult {
  const parsed = translateRequestSchema.safeParse(payload);

  if (!parsed.success) {
    return {
      ok: false,
      status: 400,
      error: {
        code: "VALIDATION_ERROR",
        message: "Please provide valid text and translator options.",
      },
    };
  }

  const text = safeTrim(parsed.data.text);

  if (!text) {
    return {
      ok: false,
      status: 400,
      error: {
        code: "VALIDATION_ERROR",
        message: "Please enter some text first.",
      },
    };
  }

  if (text.length > MAX_INPUT_CHARS) {
    return {
      ok: false,
      status: 413,
      error: {
        code: "TOO_LONG",
        message: "This passage is too long. Please shorten it.",
      },
    };
  }

  const modeKey = parsed.data.modeKey || parsed.data.mode;

  return {
    ok: true,
    data: {
      text,
      translatorSlug: parsed.data.translatorSlug || undefined,
      modeKey: modeKey || undefined,
    },
  };
}

export const categorySlugSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9-]+$/, "Slug must use lowercase letters, numbers, and dashes.");

const modeInputSchema = z.object({
  key: modeKeySchema,
  label: z.string().trim().min(2).max(120),
  description: z.string().trim().max(240).optional().or(z.literal("")),
  instruction: z.string().trim().min(8),
  sortOrder: z.number().int().min(0),
});

const exampleInputSchema = z.object({
  label: z.string().trim().min(2).max(120),
  value: z.string().trim().min(2).max(1200),
  sortOrder: z.number().int().min(0),
});

export const translatorUpsertSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: translatorSlugSchema,
  title: z.string().trim().min(2).max(140),
  subtitle: z.string().trim().min(2).max(260),
  shortDescription: z.string().trim().min(2).max(260),
  sourceLabel: z.string().trim().min(2).max(80),
  targetLabel: z.string().trim().min(2).max(80),
  iconName: z.string().trim().max(80).optional().or(z.literal("")),
  promptSystem: z.string().trim().min(10),
  promptInstructions: z.string().trim().min(10),
  seoTitle: z.string().trim().max(180).optional().or(z.literal("")),
  seoDescription: z.string().trim().max(320).optional().or(z.literal("")),
  modelOverride: z.string().trim().max(120).optional().or(z.literal("")),
  isActive: z.boolean(),
  isFeatured: z.boolean(),
  showModeSelector: z.boolean(),
  showSwap: z.boolean(),
  showExamples: z.boolean(),
  sortOrder: z.number().int().min(0).max(9999),
  primaryCategoryId: z.string().trim().min(1).optional().nullable().or(z.literal("")),
  categoryIds: z.array(z.string().trim().min(1)).min(1).max(20),
  modes: z.array(modeInputSchema).max(12),
  examples: z.array(exampleInputSchema).max(20),
});

export const categoryUpsertSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: categorySlugSchema,
  description: z.string().trim().max(260).optional().or(z.literal("")),
  sortOrder: z.number().int().min(0).max(9999),
  isActive: z.boolean(),
  iconKey: z.string().trim().max(80).optional().or(z.literal("")),
  seoTitle: z.string().trim().max(180).optional().or(z.literal("")),
  seoDescription: z.string().trim().max(320).optional().or(z.literal("")),
});

export const adPlacementUpsertSchema = z.object({
  name: z.string().trim().min(2).max(120),
  key: z.string().trim().min(2).max(120).regex(/^[a-z0-9_-]+$/),
  description: z.string().trim().max(260).optional().or(z.literal("")),
  pageType: z.enum(["ALL", "HOMEPAGE", "TRANSLATOR", "CATEGORY"]),
  deviceType: z.enum(["ALL", "DESKTOP", "MOBILE"]),
  placementType: z.enum([
    "HOMEPAGE_TOP",
    "HOMEPAGE_BETWEEN_SECTIONS",
    "TRANSLATOR_ABOVE_TOOL",
    "TRANSLATOR_BELOW_TOOL",
    "SIDEBAR_SLOT",
    "FOOTER_SLOT",
    "MOBILE_STICKY_SLOT",
    "CUSTOM",
  ]),
  providerType: z.enum(["ADSENSE", "CUSTOM_HTML"]),
  adSenseSlot: z.string().trim().max(120).optional().or(z.literal("")),
  codeSnippet: z.string().trim().max(4000).optional().or(z.literal("")),
  categoryId: z.string().trim().min(1).optional().nullable().or(z.literal("")),
  isActive: z.boolean(),
  sortOrder: z.number().int().min(0).max(9999),
});

export const adminTranslatorFilterSchema = z.object({
  q: z.string().optional(),
  status: z.enum(["all", "active", "inactive", "archived"]).optional(),
  featured: z.enum(["all", "featured", "non-featured"]).optional(),
  category: z.string().optional(),
});

export const discoveryQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  category: z.string().trim().max(80).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(24).default(12),
});

export const settingsSchema = z.object({
  platformName: z.string().trim().min(2).max(120),
  homepageTitle: z.string().trim().min(2).max(180),
  homepageSubtitle: z.string().trim().min(2).max(320),
  catalogIntro: z.string().trim().min(2).max(320),
  footerDisclaimer: z.string().trim().min(2).max(420),
  defaultTranslatorSlug: translatorSlugSchema,
  featuredTranslatorsEnabled: z.boolean(),
  autoFeaturedEnabled: z.boolean(),
  autoFeaturedWindowDays: z.number().int().min(1).max(180),
  defaultModelOverride: z.string().trim().max(120).optional().or(z.literal("")),
  discoveryPageSize: z.number().int().min(1).max(24),
  adsEnabled: z.boolean(),
  adSenseClientId: z.string().trim().max(180).optional().or(z.literal("")),
});

export const translatorRequestSchema = z.object({
  requesterEmail: z
    .string()
    .trim()
    .email("Please enter a valid email.")
    .max(160)
    .optional()
    .or(z.literal("")),
  requestedName: z.string().trim().min(2).max(140),
  description: z.string().trim().min(8).max(1400),
  exampleInput: z.string().trim().max(1200).optional().or(z.literal("")),
  desiredStyle: z.string().trim().max(900).optional().or(z.literal("")),
  suggestedCategory: z.string().trim().max(120).optional().or(z.literal("")),
  audience: z.string().trim().max(240).optional().or(z.literal("")),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
  honeypot: z.string().max(0).optional().or(z.literal("")),
  turnstileToken: z.string().trim().optional().or(z.literal("")),
});

export const adminRequestFilterSchema = z.object({
  q: z.string().trim().max(120).optional(),
  status: z.nativeEnum(TranslatorRequestStatus).optional().or(z.literal("all")),
  category: z.string().trim().max(120).optional(),
  dateFrom: z.string().date().optional(),
  dateTo: z.string().date().optional(),
});

export const requestStatusUpdateSchema = z.object({
  status: z.nativeEnum(TranslatorRequestStatus).optional(),
  adminNotes: z.string().trim().max(2400).optional().or(z.literal("")),
});

export const translatorDraftSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: translatorSlugSchema,
  title: z.string().trim().min(2).max(160),
  subtitle: z.string().trim().min(2).max(320),
  shortDescription: z.string().trim().min(2).max(260),
  sourceLabel: z.string().trim().min(2).max(80),
  targetLabel: z.string().trim().min(2).max(80),
  systemPrompt: z.string().trim().min(20).max(5000),
  promptInstructions: z.string().trim().min(20).max(5000),
  seoTitle: z.string().trim().max(180).optional().or(z.literal("")),
  seoDescription: z.string().trim().max(320).optional().or(z.literal("")),
  categorySuggestion: z.string().trim().max(120).optional().or(z.literal("")),
  modes: z
    .array(
      z.object({
        key: modeKeySchema,
        label: z.string().trim().min(2).max(120),
        description: z.string().trim().max(280).optional().or(z.literal("")),
        instruction: z.string().trim().min(8).max(1200),
        sortOrder: z.number().int().min(1).max(100),
      }),
    )
    .min(1)
    .max(8),
  examples: z
    .array(
      z.object({
        label: z.string().trim().min(2).max(120),
        value: z.string().trim().min(2).max(1200),
        sortOrder: z.number().int().min(1).max(100),
      }),
    )
    .max(12),
});

export const aiDraftInputSchema = z.object({
  brief: z.string().trim().min(12).max(2400),
});

export const usageProtectionSettingsSchema = z.object({
  usageProtectionEnabled: z.boolean(),
  ipLimitPerMinute: z.number().int().min(1).max(500),
  ipLimitPerHour: z.number().int().min(1).max(20_000),
  ipLimitPerDay: z.number().int().min(1).max(200_000),
  globalDailyTokenCap: z.number().int().min(1_000).max(2_000_000_000),
  autoEmergencyShutdownEnabled: z.boolean(),
  alertEmail: z.string().trim().email().max(160).optional().or(z.literal("")),
});

export const usageProtectionReenableSchema = z.object({
  reason: z.string().trim().max(280).optional().or(z.literal("")),
});
