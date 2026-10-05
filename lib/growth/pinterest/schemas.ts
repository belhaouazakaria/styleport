import { z } from "zod";

export const pinterestTokenResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  token_type: z.string().min(1),
  expires_in: z.number().int().positive(),
  refresh_token_expires_in: z.number().int().positive().optional(),
  refresh_token_expires_at: z.number().int().positive().optional(),
  scope: z.string().min(1),
}).passthrough();

export const pinterestUserAccountSchema = z.object({
  id: z.string().min(1),
  username: z.string().min(1),
  business_name: z.string().nullable().optional(),
  profile_image: z.string().nullable().optional(),
  website_url: z.string().nullable().optional(),
  account_type: z.string().nullable().optional(),
}).passthrough();

export const pinterestBoardSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  privacy: z.string().nullable().optional(),
  owner: z.object({ username: z.string().optional() }).passthrough().nullable().optional(),
}).passthrough();

export const pinterestBoardsPageSchema = z.object({
  items: z.array(pinterestBoardSchema),
  bookmark: z.string().nullable().optional(),
}).passthrough();

const pinterestMetricValueSchema = z.number().finite().nonnegative();
const pinterestMetricMapSchema = z.record(z.string(), pinterestMetricValueSchema);

export const pinterestAnalyticsDataStatusSchema = z.enum([
  "PROCESSING", "READY", "ESTIMATE", "BEFORE_BUSINESS_CREATED",
  "BEFORE_DATA_RETENTION_PERIOD", "BEFORE_PIN_DATA_RETENTION_PERIOD",
  "BEFORE_METRIC_START_DATE", "BEFORE_CORE_METRIC_START_DATE",
  "BEFORE_PIN_FORMAT_METRIC_START_DATE", "BEFORE_AUDIENCE_METRIC_START_DATE",
  "BEFORE_AUDIENCE_MONTHLY_METRIC_START_DATE", "BEFORE_VIDEO_METRIC_START_DATE",
  "BEFORE_CONVERSION_METRIC_START_DATE", "PURCHASERS_METRIC_SMALLER_THAN_THRESHOLD",
  "IN_BAD_TAG_DATE", "BEFORE_PUBLISHED_METRIC_START_DATE",
  "BEFORE_ASSIST_METRIC_START_DATE", "BEFORE_PIN_CREATED", "BEFORE_ACCOUNT_CLAIMED",
  "BEFORE_DEMOGRAPHIC_FILTERS_START_DATE", "AUDIENCE_SEGMENT_SMALLER_THAN_THRESHOLD",
  "AUDIENCE_TOTAL_SMALLER_THAN_THRESHOLD", "BEFORE_PRODUCT_GROUP_FILTER_START_DATE",
]);

export const pinterestDailyMetricSchema = z.object({
  data_status: pinterestAnalyticsDataStatusSchema,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  metrics: pinterestMetricMapSchema,
}).passthrough();

const pinterestAnalyticsBlockSchema = z.object({
  daily_metrics: z.array(pinterestDailyMetricSchema).default([]),
  summary_metrics: pinterestMetricMapSchema.optional(),
}).passthrough();

export const pinterestAccountAnalyticsSchema = z.record(z.string(), pinterestAnalyticsBlockSchema);
export const pinterestPinAnalyticsSchema = z.record(z.string(), pinterestAnalyticsBlockSchema.extend({
  lifetime_metrics: pinterestMetricMapSchema.optional(),
}));

export const pinterestTopPinsAnalyticsSchema = z.object({
  date_availability: z.object({
    is_realtime: z.boolean(),
    latest_available_timestamp: z.number().finite(),
  }).passthrough().optional(),
  pins: z.array(z.object({
    pin_id: z.string().min(1),
    metrics: pinterestMetricMapSchema,
    data_status: z.record(z.string(), pinterestAnalyticsDataStatusSchema).optional(),
  }).passthrough()).default([]),
  sort_by: z.enum(["ENGAGEMENT", "SAVE", "IMPRESSION", "OUTBOUND_CLICK", "PIN_CLICK"]),
}).passthrough();

const pinterestImageDetailsSchema = z.object({ url: z.string().url() }).passthrough();
export const pinterestPinSchema = z.object({
  id: z.string().min(1),
  board_id: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  link: z.string().nullable().optional(),
  created_at: z.string().datetime({ offset: true }).nullable().optional(),
  creative_type: z.string().nullable().optional(),
  media: z.object({
    media_type: z.string().optional(),
    images: z.record(z.string(), pinterestImageDetailsSchema).optional(),
  }).passthrough().nullable().optional(),
}).passthrough();

export const pinterestPinsPageSchema = z.object({
  items: z.array(pinterestPinSchema),
  bookmark: z.string().nullable().optional(),
}).passthrough();

export type PinterestTokenResponse = z.infer<typeof pinterestTokenResponseSchema>;
export type PinterestUserAccount = z.infer<typeof pinterestUserAccountSchema>;
export type PinterestBoard = z.infer<typeof pinterestBoardSchema>;
export type PinterestPin = z.infer<typeof pinterestPinSchema>;
