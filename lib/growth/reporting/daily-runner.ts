import { GrowthJobStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { archiveGrowthDailyReport } from "@/lib/growth/reporting/archive";
import { GrowthReportDeliveryBlocked, submitArchivedDailyReport } from "@/lib/growth/reporting/delivery";
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

/** Require today's three bounded local analysis jobs before an automated digest. */
export async function requireFreshGrowthCycle(now: Date) {
  const today = now.toISOString().slice(0, 10);
  const expected = ["strategy", "opportunity", "learning"]
    .map(stage => "growth-cycle-v1:" + today + ":" + stage);
  const jobs = await prisma.growthJob.findMany({
    where: { idempotencyKey: { in: expected } },
    select: { idempotencyKey: true, status: true },
  });
  if (jobs.length !== expected.length ||
      jobs.some(job => !expected.includes(job.idempotencyKey) ||
        job.status !== GrowthJobStatus.SUCCEEDED)) {
    throw Error("AUTONOMOUS_ANALYSIS_NOT_VERIFIED");
  }
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
  if (config.GROWTH_AUTONOMOUS_REQUIRE_FRESH_CYCLE === "true") {
    await requireFreshGrowthCycle(now);
  }
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
