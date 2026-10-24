import { archiveGrowthDailyReport } from "@/lib/growth/reporting/archive";
import { submitArchivedDailyReport } from "@/lib/growth/reporting/delivery";
import { getTelegramReportSettings } from "@/lib/growth/reporting/telegram";

/**
 * Daily reports cover the last fully elapsed UTC day. Waiting until 04:00 UTC
 * leaves room for daily analytics collection but is not a freshness guarantee.
 */
export function dueGrowthReportDate(now: Date): string | null {
  if (!Number.isFinite(now.getTime())) throw new Error("Invalid report scheduling clock");
  if (now.getUTCHours() < 4) return null;
  const yesterday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
  return yesterday.toISOString().slice(0, 10);
}

/**
 * Intentionally opt-in run-once entry point. A caller-owned cron/systemd timer
 * can be provisioned only AFTER recipient and live-send acceptance.
 * Neither Growth being enabled nor invoking the CLI enables reporting.
 */
export async function runScheduledGrowthDailyReport(
  now = new Date(),
  config: Record<string, string | undefined> = process.env,
) {
  if (config.GROWTH_DAILY_REPORT_SCHEDULE_ENABLED !== "true")
    return { status: "DISABLED" as const };
  // Validate the second, independent transport gate BEFORE any DB work.
  if (!getTelegramReportSettings(config).enabled)
    return { status: "DISABLED" as const };
  const date = dueGrowthReportDate(now);
  if (!date) return { status: "NOT_DUE" as const };
  const { report, reused } = await archiveGrowthDailyReport(date);
  // submitArchivedDailyReport atomically claims one immutable archive report.
  // A second invocation refuses any attempted delivery, even when uncertain.
  const result = await submitArchivedDailyReport(report.id);
  return { status: result.status, date, reportId: report.id, archiveReused: reused };
}
