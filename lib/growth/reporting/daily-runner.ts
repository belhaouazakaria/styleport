import { archiveGrowthDailyReport } from "@/lib/growth/reporting/archive";
import { GrowthReportDeliveryBlocked, submitArchivedDailyReport } from "@/lib/growth/reporting/delivery";
import { getTelegramReportSettings } from "@/lib/growth/reporting/telegram";

/**
 * Daily reports cover the most recent UTC day whose data is FINAL, which is three
 * days back. Pinterest publishes a day's metrics as PROCESSING on the next
 * morning and, as observed in late November 2026, stays PROCESSING until the
 * third morning; Search Console finalizes about two days late. Reporting "yesterday" froze every report before its data existed.
 */
export function dueGrowthReportDate(now: Date): string | null {
  if (!Number.isFinite(now.getTime())) throw new Error("Invalid report scheduling clock");
  if (now.getUTCHours() < 4) return null;
  const target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 3));
  return target.toISOString().slice(0, 10);
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
  if (config.GROWTH_NOTIFICATION_PROVIDER === "DISCORD") {
    if (config.GROWTH_DISCORD_ENABLED !== "true") return { status: "DISABLED" as const };
    const { getDiscordConfig } = await import("@/lib/growth/discord/config");
    getDiscordConfig(config);
    const { queueDiscordDailyReport } = await import("./discord");
    return queueDiscordDailyReport(now);
  }
  // Telegram is a separately opted-in legacy provider.
  // Validate the second, independent transport gate BEFORE any DB work.
  if (!getTelegramReportSettings(config).enabled)
    return { status: "DISABLED" as const };
  const date = dueGrowthReportDate(now);
  if (!date) return { status: "NOT_DUE" as const };
  const { report, reused } = await archiveGrowthDailyReport(date);
  // submitArchivedDailyReport atomically claims one immutable archive report.
  // A second invocation refuses any attempted delivery, even when uncertain.
  try {
    const result = await submitArchivedDailyReport(report.id);
    return { status: result.status, date, reportId: report.id, archiveReused: reused };
  } catch (error) {
    // Repeat cron ticks are normal. Only a confirmed SUBMITTED outcome can
    // be reported as a harmless duplicate. Never swallow SENDING / UNKNOWN.
    if (error instanceof GrowthReportDeliveryBlocked &&
        error.reason === "ALREADY_ATTEMPTED_SUBMITTED") {
      return { status: "ALREADY_SENT" as const, date, reportId: report.id, archiveReused: reused };
    }
    throw error;
  }
}
