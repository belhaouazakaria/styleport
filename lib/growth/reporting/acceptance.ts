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
  // A mode label alone is not isolation. Refuse production DB under a
  // staging label and require an additional day-specific approval in production.
  const environment = config.GROWTH_TELEGRAM_ACCEPTANCE_ENVIRONMENT;
  let db: URL;
  try {
    db = new URL(config.DATABASE_URL ?? "");
  } catch {
    throw new GrowthTelegramAcceptanceBlocked("VERIFIED_DATABASE_URL_REQUIRED");
  }
  if (!["postgres:", "postgresql:"].includes(db.protocol) ||
      !["127.0.0.1", "localhost", "::1"].includes(db.hostname)) {
    throw new GrowthTelegramAcceptanceBlocked("LOOPBACK_DATABASE_REQUIRED");
  }
  const prodDatabase = db.hostname === "127.0.0.1" && db.port === "5433" &&
    decodeURIComponent(db.pathname.slice(1)) === "saytwist";
  if (environment === "isolated-staging") {
    if (prodDatabase || !/^[a-z0-9_]{6,100}$/.test(decodeURIComponent(db.pathname.slice(1)))) {
      throw new GrowthTelegramAcceptanceBlocked("ISOLATED_STAGING_DATABASE_REQUIRED");
    }
  } else if (environment === "production") {
    if (!prodDatabase) throw new GrowthTelegramAcceptanceBlocked("EXACT_PRODUCTION_DATABASE_REQUIRED");
  } else {
    throw new GrowthTelegramAcceptanceBlocked("UNKNOWN_ACCEPTANCE_ENVIRONMENT");
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
  if (environment === "production" &&
      config.GROWTH_TELEGRAM_PRODUCTION_APPROVAL !== "I APPROVE ONE PRODUCTION DELIVERY " + id) {
    throw new GrowthTelegramAcceptanceBlocked("PRODUCTION_SINGLE_SEND_APPROVAL_REQUIRED");
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
