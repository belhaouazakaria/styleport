import { prisma } from "@/lib/prisma";

/** ADMIN caller must complete requireAdminRoute before using these readers. */
export async function listArchivedGrowthReports() {
  return prisma.growthDailyReport.findMany({
    orderBy: [{ reportDate: "desc" }, { id: "desc" }],
    take: 30,
    select: {
      id: true, reportDate: true, version: true, createdAt: true,
      delivery: {
        select: { channel: true, status: true, attemptedAt: true, submittedAt: true },
      },
    },
  });
}

export function isValidGrowthReportId(id: string): boolean {
  return /^growth-[0-9]{8}$/.test(id);
}

export async function getArchivedGrowthReport(id: string) {
  if (!isValidGrowthReportId(id)) return null;
  return prisma.growthDailyReport.findUnique({
    where: { id },
    select: {
      id: true, reportDate: true, createdAt: true, version: true,
      digestText: true,
      delivery: {
        select: {
          channel: true, status: true,
          attemptedAt: true, submittedAt: true,
          providerMessageId: true,
        },
      },
    },
  });
}
