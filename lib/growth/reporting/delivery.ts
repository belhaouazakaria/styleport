import { GrowthReportDeliveryStatus } from "@prisma/client";
import { getOpenWaReportSettings, submitOpenWaDailyReport } from "@/lib/growth/reporting/openwa";
import { prisma } from "@/lib/prisma";

export class GrowthReportDeliveryBlocked extends Error {
  constructor(readonly reason: string) {
    super(`Daily Growth report delivery blocked: ${reason}`);
    this.name = "GrowthReportDeliveryBlocked";
  }
}

/**
 * One report has at most one external send attempt. Durable SENDING is written
 * *before* calling OpenWA. Network uncertainty, process crashes or a database
 * write failure after submission never reopen the report for automatic resend.
 */
export async function submitArchivedDailyReport(reportId: string) {
  if (!/^growth-\d{8}$/.test(reportId)) throw new GrowthReportDeliveryBlocked("INVALID_REPORT_ID");
  const config = getOpenWaReportSettings();
  if (!config.enabled) throw new GrowthReportDeliveryBlocked("CHANNEL_DISABLED");

  const report = await prisma.$transaction(async (tx) => {
    // Serialize competing workers/manual actions on the same report row.
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "GrowthDailyReport" WHERE "id" = ${reportId} FOR UPDATE
    `;
    if (!locked.length) throw new GrowthReportDeliveryBlocked("REPORT_NOT_FOUND");
    const snapshot = await tx.growthDailyReport.findUniqueOrThrow({ where: { id: reportId } });
    const delivery = await tx.growthReportDelivery.upsert({
      where: { reportId },
      update: {},
      create: { reportId, status: GrowthReportDeliveryStatus.READY, channel: "OPENWA" },
    });
    if (delivery.status !== GrowthReportDeliveryStatus.READY) {
      throw new GrowthReportDeliveryBlocked(`ALREADY_ATTEMPTED_${delivery.status}`);
    }
    const claimed = await tx.growthReportDelivery.updateMany({
      where: { id: delivery.id, status: GrowthReportDeliveryStatus.READY },
      data: { status: GrowthReportDeliveryStatus.SENDING, attemptedAt: new Date() },
    });
    if (claimed.count !== 1) throw new GrowthReportDeliveryBlocked("DELIVERY_ALREADY_CLAIMED");
    return snapshot;
  });

  try {
    const submitted = await submitOpenWaDailyReport(report.digestText, config);
    const result = await prisma.growthReportDelivery.updateMany({
      where: { reportId, status: GrowthReportDeliveryStatus.SENDING },
      data: { status: GrowthReportDeliveryStatus.SUBMITTED,
        providerMessageId: submitted.messageId, submittedAt: new Date() },
    });
    if (result.count !== 1) throw new GrowthReportDeliveryBlocked("SUBMITTED_BUT_STATE_NOT_SAVED");
    return { status: "SUBMITTED" as const, reportId };
  } catch (error) {
    // If this update fails, the durable SENDING record itself still blocks
    // another attempt. SENDING / OUTCOME_UNKNOWN requires operator review.
    try {
      await prisma.growthReportDelivery.updateMany({
        where: { reportId, status: GrowthReportDeliveryStatus.SENDING },
        data: { status: GrowthReportDeliveryStatus.OUTCOME_UNKNOWN },
      });
    } catch {
      // Never rethrow a DB detail or open a resend path on uncertain outcome.
    }
    if (error instanceof GrowthReportDeliveryBlocked) throw error;
    throw new GrowthReportDeliveryBlocked("OUTCOME_UNKNOWN_REQUIRES_OPERATOR_REVIEW");
  }
}
