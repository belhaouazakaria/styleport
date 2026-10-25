import { archiveGrowthDailyReport } from "@/lib/growth/reporting/archive";
import { dueGrowthReportDate } from "@/lib/growth/reporting/daily-runner";
import { submitArchivedDailyReport } from "@/lib/growth/reporting/delivery";
import { getTelegramReportSettings } from "@/lib/growth/reporting/telegram";

/**
 * Separately gated, unscheduled ONE-TIME acceptance of a real private
 * Telegram digest. There is no CLI invocation or schedule installed by
 * importing this module. Production use requires independent operator consent.
 *
 * A durable SENDING/OUTCOME_UNKNOWN is never retried, even after a crash.
 * The report is a normal immutable previous-completed-UTC-day snapshot;
 * no synthetic message and no arbitrary recipient selection are accepted.
 */
export class GrowthTelegramAcceptanceBlocked extends Error {
  constructor(readonly reason: string) {
    super("Growth Telegram acceptance blocked: " + reason);
    this.name = "GrowthTelegramAcceptanceBlocked";
  }
}

export async function runControlledGrowthTelegramAcceptance(
  now = new Date(),
  config: Record<string, string | undefined> = process.env,
) {
  if (config.GROWTH_TELEGRAM_ACCEPTANCE_ENABLED !== "true") {
    return { status: "DISABLED" as const };
  }
  if (config.GROWTH_TELEGRAM_ACCEPTANCE_ENVIRONMENT !== "isolated-staging") {
    throw new GrowthTelegramAcceptanceBlocked("ISOLATED_STAGING_REQUIRED");
  }
  // Daily scheduling must explicitly remain OFF during one-message acceptance.
  if (config.GROWTH_DAILY_REPORT_SCHEDULE_ENABLED === "true") {
    throw new GrowthTelegramAcceptanceBlocked("SCHEDULE_MUST_REMAIN_DISABLED");
  }
  const date = dueGrowthReportDate(now);
  if (!date) throw new GrowthTelegramAcceptanceBlocked("NOT_DUE");
  const id = "growth-" + date.replaceAll("-", "");
  if (config.GROWTH_TELEGRAM_ACCEPTANCE_CONFIRMATION !== "SEND ONE TELEGRAM REPORT " + id) {
    throw new GrowthTelegramAcceptanceBlocked("EXACT_REPORT_CONFIRMATION_REQUIRED");
  }
  // Validate the single-recipient transport gate before a single database read.
  if (!getTelegramReportSettings(config).enabled) {
    throw new GrowthTelegramAcceptanceBlocked("CHANNEL_DISABLED");
  }

  // No separate delivery path: reuse normal archive and PostgreSQL once-only
  // claim. A previous unknown/submitted attempt is permanently blocked.
  const { report, reused } = await archiveGrowthDailyReport(date);
  if (report.id !== id) throw new GrowthTelegramAcceptanceBlocked("ARCHIVE_ID_MISMATCH");
  const submitted = await submitArchivedDailyReport(id);
  return {
    status: submitted.status,
    reportId: id,
    date,
    archiveReused: reused,
  };
}
