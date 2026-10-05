import { z } from "zod";

export const PINTEREST_CORE_ACCOUNT_METRICS = [
  "IMPRESSION", "SAVE", "PIN_CLICK", "OUTBOUND_CLICK", "ENGAGEMENT",
] as const;

export const PINTEREST_CORE_PIN_METRICS = [
  "IMPRESSION", "SAVE", "PIN_CLICK", "OUTBOUND_CLICK",
] as const;

export type PinterestCoreMetric = typeof PINTEREST_CORE_ACCOUNT_METRICS[number];
export const PINTEREST_ANALYTICS_LOOKBACK_DAYS = 90;
export const PINTEREST_ANALYTICS_REFRESH_DAYS = 7;
export const PINTEREST_PIN_REQUESTS_PER_JOB = 8;
export const PINTEREST_INVENTORY_REQUESTS_PER_JOB = 3;
export const PINTEREST_INVENTORY_MAX_PAGES = 10;
export const PINTEREST_INVENTORY_MAX_PINS = 2_500;

const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export function utcDateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

export function parseUtcDateOnly(value: string) {
  dateOnlySchema.parse(value);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || utcDateOnly(date) !== value) throw new Error("Invalid Pinterest analytics date.");
  return date;
}

export function analyticsDateRange(params: { startDate: string; endDate: string; now?: Date }) {
  const start = parseUtcDateOnly(params.startDate);
  const end = parseUtcDateOnly(params.endDate);
  const today = parseUtcDateOnly(utcDateOnly(params.now || new Date()));
  const oldest = new Date(today);
  oldest.setUTCDate(oldest.getUTCDate() - PINTEREST_ANALYTICS_LOOKBACK_DAYS);
  if (start > end) throw new Error("Pinterest analytics start date must not follow end date.");
  if (end > today) throw new Error("Pinterest analytics end date must not be in the future.");
  if (start < oldest) throw new Error("Pinterest analytics start date exceeds the 90-day lookback.");
  if ((end.getTime() - start.getTime()) / 86_400_000 > PINTEREST_ANALYTICS_LOOKBACK_DAYS) {
    throw new Error("Pinterest analytics date range exceeds 90 days.");
  }
  return { start, end, startDate: utcDateOnly(start), endDate: utcDateOnly(end) };
}

export function defaultBackfillRange(now = new Date()) {
  const end = parseUtcDateOnly(utcDateOnly(now));
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (PINTEREST_ANALYTICS_LOOKBACK_DAYS - 1));
  return { startDate: utcDateOnly(start), endDate: utcDateOnly(end) };
}

export function defaultRefreshRange(now = new Date()) {
  const end = parseUtcDateOnly(utcDateOnly(now));
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (PINTEREST_ANALYTICS_REFRESH_DAYS - 1));
  return { startDate: utcDateOnly(start), endDate: utcDateOnly(end) };
}

export function metricCount(metrics: Record<string, number>, name: PinterestCoreMetric) {
  for (const metricName of Object.keys(metrics)) {
    if (!(PINTEREST_CORE_ACCOUNT_METRICS as readonly string[]).includes(metricName)) {
      throw new Error(`Pinterest returned unsupported metric ${metricName}.`);
    }
  }
  const value = metrics[name] ?? 0;
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`Pinterest returned invalid ${name} metric.`);
  return BigInt(value);
}

export function ratePercent(numerator: bigint, denominator: bigint) {
  return denominator === BigInt(0) ? 0 : Number((numerator * BigInt(10_000)) / denominator) / 100;
}
