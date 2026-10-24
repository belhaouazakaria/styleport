import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminTopbar } from "@/components/admin/admin-topbar";
import { buttonVariants } from "@/components/ui/button";
import { requireAdminRoute } from "@/lib/auth";
import { getArchivedGrowthReport } from "@/lib/growth/reporting/admin";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function GrowthReportDetailPage({
  params,
}: {
  params: Promise<{ reportId: string }>;
}) {
  await requireAdminRoute();
  const { reportId } = await params;
  const report = await getArchivedGrowthReport(reportId);
  if (!report) notFound();

  const delivery = report.delivery;

  return (
    <>
      <AdminTopbar
        title={`Growth report · ${report.reportDate.toISOString().slice(0, 10)}`}
        subtitle="Immutable archived digest and delivery audit state."
      />
      <main className="space-y-5 p-4 sm:p-6">
        <Link href="/admin/growth/reports" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
          ← All reports
        </Link>
        <section className="rounded-2xl border border-border bg-white p-5 text-sm leading-6">
          <h2 className="font-display text-xl font-bold text-ink">Archive details</h2>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2">
            <div><dt className="text-muted-ink">Archive ID</dt><dd className="font-medium text-ink">{report.id}</dd></div>
            <div><dt className="text-muted-ink">Version</dt><dd className="font-medium text-ink">{report.version}</dd></div>
            <div><dt className="text-muted-ink">Created</dt><dd>{report.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC</dd></div>
            <div><dt className="text-muted-ink">Channel</dt><dd>{delivery?.channel ?? "Not attempted"}</dd></div>
            <div><dt className="text-muted-ink">Send status</dt><dd>{delivery?.status ?? "No delivery record"}</dd></div>
            <div><dt className="text-muted-ink">Attempted</dt><dd>{delivery?.attemptedAt?.toISOString() ?? "Never"}</dd></div>
            <div><dt className="text-muted-ink">API submitted</dt><dd>{delivery?.submittedAt?.toISOString() ?? "Unconfirmed"}</dd></div>
            <div><dt className="text-muted-ink">Provider message ID</dt><dd className="break-all">{delivery?.providerMessageId ?? "Not recorded"}</dd></div>
          </dl>
          <p className="mt-3 text-muted-ink">
            SUBMITTED means accepted by the provider API, not a read receipt.
            SENDING and OUTCOME_UNKNOWN must not be automatically resent.
          </p>
        </section>
        <section className="rounded-2xl border border-border bg-white p-5">
          <h2 className="font-display text-xl font-bold text-ink">Archived daily digest</h2>
          <pre className="mt-4 overflow-x-auto whitespace-pre-wrap break-words text-sm leading-6 text-ink">{report.digestText}</pre>
        </section>
      </main>
    </>
  );
}
