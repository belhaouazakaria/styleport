import { prisma } from "@/lib/prisma";
import { archiveGrowthDailyReport } from "./archive";
import { dueGrowthReportDate } from "./daily-runner";
import { loadBriefingData } from "./briefing";
import { briefingEmbed } from "./briefing-embed";

/** Reuses immutable archived evidence. Discord receives a bounded digest and a
 * link to the full report; no Telegram credential or delivery state is needed. */
export async function queueDiscordDailyReport(now = new Date()) {
  const date = dueGrowthReportDate(now);
  if (!date) return { status: "NOT_DUE" as const };
  const { report } = await archiveGrowthDailyReport(date);
  const start = new Date(date + "T00:00:00Z");
  const end = new Date(start.getTime() + 86400000);
  const [accounts, sourceTests, conversions, campaigns, backfills, pending] =
    await Promise.all([
      prisma.growthPinterestAccountMetricDaily.findMany({
        where: { metricDate: start },
        include: { account: { select: { username: true } } },
        take: 3,
      }),
      prisma.growthViralPinTest.count({
        where: { channel: "SOURCE", publishedAt: { gte: start, lt: end } },
      }),
      prisma.growthViralConversion.count({
        where: { createdAt: { gte: start, lt: end } },
      }),
      prisma.growthViralConversion.count({
        where: {
          status: "CAMPAIGN_PREPARED",
          updatedAt: { gte: start, lt: end },
        },
      }),
      prisma.growthPinterestAnalyticsRecovery.count({
        where: { status: "COMPLETED", completedAt: { gte: start, lt: end } },
      }),
      prisma.growthApprovalRequest.count({
        where: { status: "PENDING", expiresAt: { gt: now } },
      }),
    ]);
  const accountSummary = accounts.length
    ? accounts
        .map(
          (a) =>
            a.account.username +
            ": " +
            (a.dataStatus === "READY"
              ? a.impressions +
                " impressions, " +
                a.saves +
                " saves, " +
                a.outboundClicks +
                " outbound clicks"
              : "Provider data " + a.dataStatus),
        )
        .join("\n")
    : "Account metrics unavailable for this date.";
  const extra =
    "\n\n" +
    accountSummary +
    "\nSource Pins published: " +
    sourceTests +
    " · Winner proposals: " +
    conversions +
    " · Native campaigns prepared: " +
    campaigns +
    "\nBackfills completed: " +
    backfills +
    " · Pending owner decisions now: " +
    pending;
  // The briefing is computed live from final data and does not depend on the
  // immutable archive, which may have been frozen before late data arrived.
  let payload: Record<string, unknown>;
  let dedupePrefix = "discord-report:";
  let dedupeId = report.id;
  try {
    payload = briefingEmbed(await loadBriefingData(date), "https://saytwist.com/admin/growth/reports/" + report.id) as unknown as Record<string, unknown>;
    dedupePrefix = "discord-brief:";
    dedupeId = date.replaceAll("-", "");
  } catch {
    payload = {
      content: (
        report.digestText.slice(0, Math.max(0, 1800 - extra.length)) +
        extra +
        "\n\nFull report: https://saytwist.com/admin/growth/reports/" +
        report.id
      ).slice(0, 1990),
      allowed_mentions: { parse: [] },
    };
  }
  const dedupeKey = dedupePrefix + dedupeId;
  await prisma.growthNotification.upsert({
    where: { dedupeKey },
    update: {},
    create: {
      dedupeKey,
      payload: payload as object,
    },
  });
  return { status: "QUEUED" as const, reportId: report.id };
}
